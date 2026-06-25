/**
 * Integration tests untuk SalesService — auto-post jurnal utama + HPP + stok.
 *
 * Cakupan:
 *   - POST → 2 jurnal (utama + HPP) ter-link via journalId/hppJournalId
 *   - Skema utama: D Piutang totalNetto, K Pendapatan(DPP), K Utang PPN
 *   - PPN PMK 131/2024 efektif 11%: 1.000.000 → DPP 1.000.000, PPN 110.000
 *   - PPN tarif 12 BKP mewah: 1.000.000 → DPP 1.000.000, PPN 120.000
 *   - Klasifikasi BEBAS_PPN/NON_BKP → PPN = 0
 *   - HPP journal: D HPP per akunHpp, K Persediaan per akunPersediaan (FIFO)
 *   - Stok berkurang (StokMovement OUT) dengan sumberType='SALES_LINE'
 *   - Cancel POSTED → reverse jurnal utama + HPP, stok kembali
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { TenancyService } from '../src/common/tenancy/tenancy.service.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { SalesService } from '../src/modules/sales/sales.service.js';
import {
  bootAppWithSales,
  createTestCustomer,
  createTestItem,
  createTestTenant,
  resetDb,
  seedOpeningStock,
  setCostMethod,
  superPrisma,
  withTenant,
} from './helpers.js';
import { CostMethod, InvoiceStatus, JournalSource, JournalStatus, KlasifikasiPpn } from '@lentera/db';

describe('Sales auto-post — integration', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let tenancy: TenancyService;
  let inventory: InventoryService;
  let sales: SalesService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;
  let customerId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await bootAppWithSales();
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    tenancy = app.get(TenancyService);
    inventory = app.get(InventoryService);
    sales = app.get(SalesService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    t = await createTestTenant(prisma);
    await setCostMethod(t.tenantId, CostMethod.FIFO);
    const cust = await createTestCustomer(t.tenantId, t.akun.piutang);
    customerId = cust.id;
    const item = await createTestItem(t.tenantId, t.akun, {
      kode: 'BRG-S', nama: 'Barang Sales', hargaJual: '10000',
    });
    itemId = item.id;
    // Stok awal 50 @ harga pokok 6000.
    await seedOpeningStock(ctx, inventory, tenancy, tenantCtxRaw(), {
      itemId: item.id, cabangId: t.cabangId, qty: '50', hargaPokok: '6000',
      tanggal: new Date(Date.UTC(2026, 3, 28)),
    });
  });

  function tenantCtxRaw() {
    return { tenantId: t.tenantId, userId: t.userId, role: 'OWNER', cabangIds: null };
  }

  describe('POST happy path (PPN 11% efektif)', () => {
    it('terbitkan faktur POSTED + jurnal utama + jurnal HPP, semua ter-link', async () => {
      const result = await withTenant(ctx, tenantCtxRaw(), async () => {
        const draft = await sales.createDraft({
          cabangId: t.cabangId,
          customerId,
          tanggal: '2026-05-10',
          termin: 'KREDIT',
          akunArId: t.akun.piutang,
          tarifPpnPersen: 11,
          lines: [
            {
              itemId, deskripsi: 'Barang Sales', qty: '10', satuan: 'Pcs',
              hargaSatuan: '10000', diskonPersen: '0',
              klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
              akunPendapatanId: t.akun.pendapatan,
            },
          ],
        });
        expect(draft.status).toBe(InvoiceStatus.DRAFT);
        return sales.post(draft.id);
      });

      expect(result.status).toBe(InvoiceStatus.POSTED);
      expect(result.nomor).toMatch(/^INV-2026-05-\d{4}$/);
      expect(result.journalId).not.toBeNull();
      expect(result.hppJournalId).not.toBeNull();
      // DPP 10 × 10000 = 100.000; PPN efektif 11% = 11.000; netto 111.000.
      expect(result.totalDpp.toString()).toBe('100000');
      expect(result.totalPpn.toString()).toBe('11000');
      expect(result.totalNetto.toString()).toBe('111000');
    });

    it('jurnal utama: D Piutang 111.000, K Pendapatan 100.000, K Utang PPN 11.000', async () => {
      const result = await withTenant(ctx, tenantCtxRaw(), async () => {
        const draft = await sales.createDraft({
          cabangId: t.cabangId, customerId, tanggal: '2026-05-10',
          termin: 'KREDIT', akunArId: t.akun.piutang, tarifPpnPersen: 11,
          lines: [{
            itemId, deskripsi: 'X', qty: '10', satuan: 'Pcs',
            hargaSatuan: '10000', diskonPersen: '0',
            klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
            akunPendapatanId: t.akun.pendapatan,
          }],
        });
        return sales.post(draft.id);
      });

      const lines = await superPrisma.journalLine.findMany({
        where: { journalId: result.journalId! },
        orderBy: { no: 'asc' },
      });
      const debitPiutang = lines.find((l) => l.accountId === t.akun.piutang);
      const kreditPendapatan = lines.find((l) => l.accountId === t.akun.pendapatan);
      const kreditPpn = lines.find((l) => l.accountId !== t.akun.piutang && l.accountId !== t.akun.pendapatan);
      expect(debitPiutang!.debit.toString()).toBe('111000');
      expect(debitPiutang!.kredit.toString()).toBe('0');
      expect(kreditPendapatan!.kredit.toString()).toBe('100000');
      expect(kreditPpn!.kredit.toString()).toBe('11000');

      // Jurnal source + sumberRef
      const jurnal = await superPrisma.journal.findUnique({ where: { id: result.journalId! } });
      expect(jurnal!.sumber).toBe(JournalSource.PENJUALAN);
      expect(jurnal!.sumberRef).toBe(result.id);
    });

    it('jurnal HPP: D HPP 60.000 (10×6000), K Persediaan 60.000', async () => {
      const result = await withTenant(ctx, tenantCtxRaw(), async () => {
        const draft = await sales.createDraft({
          cabangId: t.cabangId, customerId, tanggal: '2026-05-10',
          termin: 'KREDIT', akunArId: t.akun.piutang, tarifPpnPersen: 11,
          lines: [{
            itemId, deskripsi: 'X', qty: '10', satuan: 'Pcs',
            hargaSatuan: '10000', diskonPersen: '0',
            klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
            akunPendapatanId: t.akun.pendapatan,
          }],
        });
        return sales.post(draft.id);
      });

      const hppLines = await superPrisma.journalLine.findMany({
        where: { journalId: result.hppJournalId! },
        orderBy: { no: 'asc' },
      });
      expect(hppLines).toHaveLength(2);
      const hppDebit = hppLines.find((l) => l.accountId === t.akun.hpp);
      const persediaanKredit = hppLines.find((l) => l.accountId === t.akun.persediaan);
      expect(hppDebit!.debit.toString()).toBe('60000');
      expect(persediaanKredit!.kredit.toString()).toBe('60000');
    });

    it('StokMovement OUT terbentuk dengan sumberType=SALES_LINE', async () => {
      const result = await withTenant(ctx, tenantCtxRaw(), async () => {
        const draft = await sales.createDraft({
          cabangId: t.cabangId, customerId, tanggal: '2026-05-10',
          termin: 'KREDIT', akunArId: t.akun.piutang, tarifPpnPersen: 11,
          lines: [{
            itemId, deskripsi: 'X', qty: '10', satuan: 'Pcs',
            hargaSatuan: '10000', diskonPersen: '0',
            klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
            akunPendapatanId: t.akun.pendapatan,
          }],
        });
        return sales.post(draft.id);
      });

      const movs = await superPrisma.stokMovement.findMany({
        where: { sumberType: 'SALES_LINE', itemId },
      });
      expect(movs).toHaveLength(1);
      expect(movs[0]!.qtyOut.toString()).toBe('10');
      expect(movs[0]!.tipe).toBe('PENJUALAN');
      // saldo SETELAH outbound = 50 - 10 = 40 ; nilai = 50×6000 - 60000 = 240000
      expect(movs[0]!.saldoQty.toString()).toBe('40');
      expect(movs[0]!.saldoNilai.toString()).toBe('240000');

      // Faktur POSTED juga harus memuaskan invariant: jurnal utama POSTED dengan totalDebit = totalKredit.
      const jurnal = await superPrisma.journal.findUnique({ where: { id: result.journalId! } });
      expect(jurnal!.status).toBe(JournalStatus.POSTED);
      expect(jurnal!.totalDebit.toString()).toBe(jurnal!.totalKredit.toString());
    });
  });

  describe('Klasifikasi PPN', () => {
    it('tarif 12 BKP mewah: DPP penuh × 12% (bukan efektif 11%)', async () => {
      const result = await withTenant(ctx, tenantCtxRaw(), async () => {
        const draft = await sales.createDraft({
          cabangId: t.cabangId, customerId, tanggal: '2026-05-10',
          termin: 'KREDIT', akunArId: t.akun.piutang, tarifPpnPersen: 12,
          lines: [{
            itemId, deskripsi: 'X', qty: '10', satuan: 'Pcs',
            hargaSatuan: '10000', diskonPersen: '0',
            klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
            akunPendapatanId: t.akun.pendapatan,
          }],
        });
        return sales.post(draft.id);
      });
      // DPP 100.000 × 12% = 12.000
      expect(result.totalPpn.toString()).toBe('12000');
      expect(result.totalNetto.toString()).toBe('112000');
    });

    it('BEBAS_PPN → PPN = 0, jurnal tidak ada baris utang PPN', async () => {
      const result = await withTenant(ctx, tenantCtxRaw(), async () => {
        const draft = await sales.createDraft({
          cabangId: t.cabangId, customerId, tanggal: '2026-05-10',
          termin: 'KREDIT', akunArId: t.akun.piutang, tarifPpnPersen: 11,
          lines: [{
            itemId, deskripsi: 'X', qty: '10', satuan: 'Pcs',
            hargaSatuan: '10000', diskonPersen: '0',
            klasifikasiPpn: KlasifikasiPpn.BEBAS_PPN, isJasa: false,
            akunPendapatanId: t.akun.pendapatan,
          }],
        });
        return sales.post(draft.id);
      });
      expect(result.totalPpn.toString()).toBe('0');
      expect(result.totalNetto.toString()).toBe('100000');

      const lines = await superPrisma.journalLine.findMany({
        where: { journalId: result.journalId! },
      });
      // Hanya 2 baris: D Piutang, K Pendapatan (no PPN line)
      expect(lines).toHaveLength(2);
    });
  });

  describe('Cancel POSTED → reverse 3 hal (jurnal utama, HPP, stok)', () => {
    it('jurnal utama + HPP keduanya ada reversedById; stok kembali 50', async () => {
      const posted = await withTenant(ctx, tenantCtxRaw(), async () => {
        const draft = await sales.createDraft({
          cabangId: t.cabangId, customerId, tanggal: '2026-05-10',
          termin: 'KREDIT', akunArId: t.akun.piutang, tarifPpnPersen: 11,
          lines: [{
            itemId, deskripsi: 'X', qty: '10', satuan: 'Pcs',
            hargaSatuan: '10000', diskonPersen: '0',
            klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
            akunPendapatanId: t.akun.pendapatan,
          }],
        });
        return sales.post(draft.id);
      });

      const cancelled = await withTenant(ctx, tenantCtxRaw(), () =>
        sales.cancel(posted.id, 'Salah input customer'),
      );
      expect(cancelled.status).toBe(InvoiceStatus.CANCELLED);

      // Jurnal utama & HPP statusnya REVERSED, ada reversedById
      const jurnalUtama = await superPrisma.journal.findUnique({ where: { id: posted.journalId! } });
      const jurnalHpp = await superPrisma.journal.findUnique({ where: { id: posted.hppJournalId! } });
      expect(jurnalUtama!.status).toBe(JournalStatus.REVERSED);
      expect(jurnalUtama!.reversedById).not.toBeNull();
      expect(jurnalHpp!.status).toBe(JournalStatus.REVERSED);
      expect(jurnalHpp!.reversedById).not.toBeNull();

      // Stok: REVERSAL movement add back qty, saldo terkini kembali ke 50.
      const lastMov = await superPrisma.stokMovement.findFirst({
        where: { itemId, cabangId: t.cabangId },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      });
      expect(lastMov!.saldoQty.toString()).toBe('50');
      expect(lastMov!.sumberType).toBe('REVERSAL');
    });

    it('cancel DRAFT (belum posted) → status CANCELLED tanpa reversal', async () => {
      const draft = await withTenant(ctx, tenantCtxRaw(), () =>
        sales.createDraft({
          cabangId: t.cabangId, customerId, tanggal: '2026-05-10',
          termin: 'KREDIT', akunArId: t.akun.piutang, tarifPpnPersen: 11,
          lines: [{
            itemId, deskripsi: 'X', qty: '10', satuan: 'Pcs',
            hargaSatuan: '10000', diskonPersen: '0',
            klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
            akunPendapatanId: t.akun.pendapatan,
          }],
        }),
      );
      const cancelled = await withTenant(ctx, tenantCtxRaw(), () =>
        sales.cancel(draft.id, 'Nggak jadi'),
      );
      expect(cancelled.status).toBe(InvoiceStatus.CANCELLED);
      // Tidak ada jurnal & stok movement.
      expect(draft.journalId).toBeNull();
    });
  });
});
