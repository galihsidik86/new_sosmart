/**
 * Regresi untuk bug overpayment: sebelum perbaikan, `applySalesPayment` /
 * `applyPurchasePayment` (cashbank.service.ts) menghitung totalDibayar dan
 * menurunkan status (POSTED/PARTIAL/PAID) TANPA pernah menolak kalau
 * dibayar > totalNetto. Kasir bisa input BKM lebih besar dari sisa piutang
 * dan sistem diam-diam menandai PAID walau lebih bayar, tanpa jejak akun
 * kelebihan bayar mana pun.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { TenancyService } from '../src/common/tenancy/tenancy.service.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { SalesService } from '../src/modules/sales/sales.service.js';
import { CashBankService } from '../src/modules/cashbank/cashbank.service.js';
import { CashBankModule } from '../src/modules/cashbank/cashbank.module.js';
import { InventoryModule } from '../src/modules/inventory/inventory.module.js';
import { SalesModule } from '../src/modules/sales/sales.module.js';
import {
  bootApp,
  createTestCustomer,
  createTestItem,
  createTestTenant,
  resetDb,
  seedOpeningStock,
  setCostMethod,
  superPrisma,
} from './helpers.js';
import { CostMethod, InvoiceStatus, KlasifikasiPpn } from '@lentera/db';

describe('CashBank — validasi overpayment (integration)', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let tenancy: TenancyService;
  let inventory: InventoryService;
  let sales: SalesService;
  let cashbank: CashBankService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;
  let invoiceId: string;

  beforeAll(async () => {
    app = await bootApp([InventoryModule, SalesModule, CashBankModule]);
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    tenancy = app.get(TenancyService);
    inventory = app.get(InventoryService);
    sales = app.get(SalesService);
    cashbank = app.get(CashBankService);
  });

  afterAll(async () => {
    await app.close();
  });

  function tenantCtxRaw() {
    return { tenantId: t.tenantId, userId: t.userId, role: 'OWNER', cabangIds: null };
  }

  beforeEach(async () => {
    await resetDb(prisma);
    t = await createTestTenant(prisma);
    await setCostMethod(t.tenantId, CostMethod.FIFO);
    const cust = await createTestCustomer(t.tenantId, t.akun.piutang);
    const item = await createTestItem(t.tenantId, t.akun, {
      kode: 'BRG-CB', nama: 'Barang', hargaJual: '10000',
    });
    await seedOpeningStock(ctx, inventory, tenancy, tenantCtxRaw(), {
      itemId: item.id, cabangId: t.cabangId, qty: '50', hargaPokok: '6000',
      tanggal: new Date(Date.UTC(2026, 3, 28)),
    });

    // Faktur netto 111.000 (DPP 100.000 + PPN 11.000).
    const ctxWithTenant = (fn: () => Promise<any>) =>
      new Promise((resolve, reject) => ctx.run(tenantCtxRaw(), () => fn().then(resolve, reject)));
    const inv = (await ctxWithTenant(async () => {
      const draft = await sales.createDraft({
        cabangId: t.cabangId,
        customerId: cust.id,
        tanggal: '2026-05-10',
        termin: 'KREDIT',
        akunArId: t.akun.piutang,
        tarifPpnPersen: 11,
        lines: [{
          itemId: item.id, deskripsi: 'Barang', qty: '10', satuan: 'Pcs',
          hargaSatuan: '10000', diskonPersen: '0',
          klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
          akunPendapatanId: t.akun.pendapatan,
        }],
      });
      return sales.post(draft.id);
    })) as { id: string; totalNetto: string };
    invoiceId = inv.id;
    expect(inv.totalNetto.toString()).toBe('111000');
  });

  function withOwner<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => ctx.run(tenantCtxRaw(), () => fn().then(resolve, reject)));
  }

  it('BKM sesuai sisa piutang (111.000) → PAID', async () => {
    const result = await withOwner(async () => {
      const draft = await cashbank.createDraft({
        cabangId: t.cabangId,
        tipe: 'RECEIPT',
        tanggal: '2026-05-11',
        akunKasBankId: t.akun.kas,
        total: '111000',
        salesInvoiceId: invoiceId,
        lines: [{ accountId: t.akun.piutang, nilai: '111000' }],
      });
      return cashbank.post(draft.id);
    });
    expect(result.status).toBe(InvoiceStatus.POSTED);

    const inv = await superPrisma.salesInvoice.findUnique({ where: { id: invoiceId } });
    expect(inv?.status).toBe(InvoiceStatus.PAID);
    expect(inv?.totalDibayar.toString()).toBe('111000');
  });

  it('BKM melebihi sisa piutang (150.000 > 111.000) → ditolak', async () => {
    await expect(
      withOwner(async () => {
        const draft = await cashbank.createDraft({
          cabangId: t.cabangId,
          tipe: 'RECEIPT',
          tanggal: '2026-05-11',
          akunKasBankId: t.akun.kas,
          total: '150000',
          salesInvoiceId: invoiceId,
          lines: [{ accountId: t.akun.piutang, nilai: '150000' }],
        });
        return cashbank.post(draft.id);
      }),
    ).rejects.toThrow(BadRequestException);

    // Invoice tidak berubah — transaksi di-rollback penuh.
    const inv = await superPrisma.salesInvoice.findUnique({ where: { id: invoiceId } });
    expect(inv?.status).toBe(InvoiceStatus.POSTED);
    expect(inv?.totalDibayar.toString()).toBe('0');
  });

  it('2 BKM parsial berturutan (60.000 lalu 51.000) → PARTIAL lalu PAID, tidak ada lost update', async () => {
    await withOwner(async () => {
      const draft = await cashbank.createDraft({
        cabangId: t.cabangId, tipe: 'RECEIPT', tanggal: '2026-05-11',
        akunKasBankId: t.akun.kas, total: '60000', salesInvoiceId: invoiceId,
        lines: [{ accountId: t.akun.piutang, nilai: '60000' }],
      });
      return cashbank.post(draft.id);
    });
    let inv = await superPrisma.salesInvoice.findUnique({ where: { id: invoiceId } });
    expect(inv?.status).toBe(InvoiceStatus.PARTIAL);
    expect(inv?.totalDibayar.toString()).toBe('60000');

    await withOwner(async () => {
      const draft = await cashbank.createDraft({
        cabangId: t.cabangId, tipe: 'RECEIPT', tanggal: '2026-05-12',
        akunKasBankId: t.akun.kas, total: '51000', salesInvoiceId: invoiceId,
        lines: [{ accountId: t.akun.piutang, nilai: '51000' }],
      });
      return cashbank.post(draft.id);
    });
    inv = await superPrisma.salesInvoice.findUnique({ where: { id: invoiceId } });
    expect(inv?.status).toBe(InvoiceStatus.PAID);
    expect(inv?.totalDibayar.toString()).toBe('111000');
  });
});
