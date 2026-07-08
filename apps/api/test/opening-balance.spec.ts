/**
 * Integration test untuk Prosedur Saldo Awal Terintegrasi.
 *
 * Cakupan:
 *  - preview() menolak posting kalau belum balance (selisih != 0)
 *  - post() balanced → jurnal akun manual + persediaan + piutang + utang
 *    semua D=K, akun kliring (3-105, auto-provisioned) net 0 di GL
 *  - invoice isSaldoAwal TIDAK bikin baris pendapatan/PPN/stok-outbound
 *  - Account.saldoAwal ter-reset ke 0 setelah posting + terkunci
 *    (PATCH /accounts/:id ditolak untuk akun subsidiary)
 *  - void() mengembalikan semua ke kondisi semula
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { OpeningBalanceService } from '../src/modules/opening-balance/opening-balance.service.js';
import { OpeningBalanceModule } from '../src/modules/opening-balance/opening-balance.module.js';
import { SalesModule } from '../src/modules/sales/sales.module.js';
import { SalesService } from '../src/modules/sales/sales.service.js';
import { PurchasesModule } from '../src/modules/purchases/purchases.module.js';
import { PurchasesService } from '../src/modules/purchases/purchases.service.js';
import { BuktiPotongModule } from '../src/modules/bukti-potong/bukti-potong.module.js';
import { InventoryModule } from '../src/modules/inventory/inventory.module.js';
import { AccountsService } from '../src/modules/accounts/accounts.service.js';
import { AccountsModule } from '../src/modules/accounts/accounts.module.js';
import {
  bootApp,
  createTestTenant,
  resetDb,
  superPrisma,
} from './helpers.js';
import { InvoiceStatus, JournalStatus, KlasifikasiPpn } from '@lentera/db';

describe('OpeningBalanceService — integration', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let ob: OpeningBalanceService;
  let accounts: AccountsService;
  let sales: SalesService;
  let purchases: PurchasesService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;
  let customerId: string;
  let vendorId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await bootApp([OpeningBalanceModule, SalesModule, PurchasesModule, BuktiPotongModule, InventoryModule, AccountsModule]);
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    ob = app.get(OpeningBalanceService);
    accounts = app.get(AccountsService);
    sales = app.get(SalesService);
    purchases = app.get(PurchasesService);
  });

  afterAll(async () => {
    await app.close();
  });

  function ownerCtx() {
    return { tenantId: t.tenantId, userId: t.userId, role: 'OWNER', cabangIds: null };
  }

  function withOwner<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => ctx.run(ownerCtx(), () => fn().then(resolve, reject)));
  }

  beforeEach(async () => {
    await resetDb(prisma);
    t = await createTestTenant(prisma);
    const cust = await superPrisma.customer.create({
      data: {
        tenantId: t.tenantId, kode: 'CUST-OB', nama: 'Pelanggan Saldo Awal',
        isPkp: true, terminHari: 14, kreditLimit: '1000000000', akunPiutangId: t.akun.piutang,
      },
    });
    customerId = cust.id;
    const vendor = await superPrisma.vendor.create({
      data: {
        tenantId: t.tenantId, kode: 'VEND-OB', nama: 'Vendor Saldo Awal',
        isPkp: true, terminHari: 30, akunUtangId: t.akun.utangUsaha,
      },
    });
    vendorId = vendor.id;
    const item = await superPrisma.item.create({
      data: {
        tenantId: t.tenantId, kode: 'BRG-OB', nama: 'Barang Saldo Awal',
        satuan: 'Pcs', hargaJualDefault: '10000', klasifikasiPpn: KlasifikasiPpn.BKP,
        akunPendapatanId: t.akun.pendapatan, akunPersediaanId: t.akun.persediaan, akunHppId: t.akun.hpp,
      },
    });
    itemId = item.id;
  });

  it('preview() belum balance → post() ditolak', async () => {
    await withOwner(async () => {
      await ob.setAkunLines({ lines: [{ accountId: t.akun.kas, nilai: '100000000' }] });
      // Tidak ada baris lawan — pasti timpang.
    });
    const preview = await withOwner(() => ob.preview());
    expect(preview.balanced).toBe(false);
    expect(preview.selisih).toBe('100000000.00');

    await expect(withOwner(() => ob.post())).rejects.toThrow(BadRequestException);
  });

  it('post() balanced → semua jurnal D=K, akun kliring net 0, invoice tidak bikin baris pendapatan/PPN/stok', async () => {
    await withOwner(async () => {
      // Kas 100jt (D) + Modal 130jt (K) — tidak balance sendiri, tapi balance
      // keseluruhan bersama piutang/utang/persediaan di bawah.
      await ob.setAkunLines({
        lines: [
          { accountId: t.akun.kas, nilai: '100000000' },
          { accountId: t.akun.modal, nilai: '130000000' },
        ],
      });
      await ob.addPiutang({
        customerId, cabangId: t.cabangId, tanggal: '2026-01-01', nominal: '50000000',
      });
      await ob.addUtang({
        vendorId, cabangId: t.cabangId, tanggal: '2026-01-01', nominal: '30000000',
      });
      await ob.setPersediaan({
        lines: [{ itemId, cabangId: t.cabangId, tanggal: '2026-01-01', qty: '10', hargaPokokPerUnit: '1000000' }],
      });
    });

    const preview = await withOwner(() => ob.preview());
    // Debit: Kas 100jt + Piutang 50jt + Persediaan 10jt = 160jt
    // Kredit: Modal 130jt + Utang 30jt = 160jt
    expect(preview.totalDebit).toBe('160000000.00');
    expect(preview.totalKredit).toBe('160000000.00');
    expect(preview.balanced).toBe(true);

    const run = await withOwner(() => ob.post());
    expect(run.status).toBe(InvoiceStatus.POSTED);

    // Semua jurnal SALDO_AWAL untuk run ini harus D=K (dijamin DB constraint,
    // tapi kita verifikasi juga di level aplikasi).
    const journals = await superPrisma.journal.findMany({
      where: { sumber: 'SALDO_AWAL', sumberRef: run.id },
    });
    expect(journals.length).toBeGreaterThan(0);
    for (const j of journals) {
      expect(j.status).toBe(JournalStatus.POSTED);
      expect(j.totalDebit.toString()).toBe(j.totalKredit.toString());
    }

    // Akun kliring (3-105, auto-provisioned) — net balance harus 0.
    const kliring = await superPrisma.account.findFirst({ where: { tenantId: t.tenantId, kode: '3-105' } });
    expect(kliring).not.toBeNull();
    const kliringLines = await superPrisma.journalLine.aggregate({
      where: { accountId: kliring!.id, journal: { status: JournalStatus.POSTED } },
      _sum: { debit: true, kredit: true },
    });
    const debitSum = Number(kliringLines._sum.debit ?? 0);
    const kreditSum = Number(kliringLines._sum.kredit ?? 0);
    expect(debitSum - kreditSum).toBe(0);

    // Invoice piutang: POSTED, journalId ter-set, TIDAK ada baris pendapatan
    // (akun 4-101) atau PPN — cuma D piutang / K kliring.
    const piutangInv = await superPrisma.salesInvoice.findFirst({ where: { saldoAwalId: run.id } });
    expect(piutangInv?.status).toBe(InvoiceStatus.POSTED);
    expect(piutangInv?.totalPpn.toString()).toBe('0');
    const piutangJournalLines = await superPrisma.journalLine.findMany({
      where: { journalId: piutangInv!.journalId! },
    });
    expect(piutangJournalLines).toHaveLength(2);
    expect(piutangJournalLines.some((l) => l.accountId === t.akun.pendapatan)).toBe(false);

    // Item: TIDAK ada StokMovement bertipe PENJUALAN (stok tidak keluar) —
    // yang ada cuma STOK_AWAL dari persediaan.
    const movements = await superPrisma.stokMovement.findMany({ where: { itemId } });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.tipe).toBe('STOK_AWAL');

    // Account.saldoAwal ter-reset ke 0 untuk SEMUA akun tenant.
    const kasAfter = await superPrisma.account.findUnique({ where: { id: t.akun.kas } });
    expect(Number(kasAfter?.saldoAwal)).toBe(0);
    const modalAfter = await superPrisma.account.findUnique({ where: { id: t.akun.modal } });
    expect(Number(modalAfter?.saldoAwal)).toBe(0);

    // Akun subsidiary (Piutang) terkunci — PATCH ditolak kalau coba ubah saldoAwal.
    await expect(
      withOwner(() =>
        accounts.update(t.akun.piutang, {
          kode: '1-103', nama: 'Piutang Usaha', isPostable: true, isActive: true,
          saldoAwal: '999999',
        } as any),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('void() mengembalikan semua ke kondisi semula', async () => {
    await withOwner(async () => {
      await ob.setAkunLines({
        lines: [
          { accountId: t.akun.kas, nilai: '100000000' },
          { accountId: t.akun.modal, nilai: '130000000' },
        ],
      });
      await ob.addPiutang({ customerId, cabangId: t.cabangId, tanggal: '2026-01-01', nominal: '50000000' });
      await ob.addUtang({ vendorId, cabangId: t.cabangId, tanggal: '2026-01-01', nominal: '30000000' });
      await ob.setPersediaan({
        lines: [{ itemId, cabangId: t.cabangId, tanggal: '2026-01-01', qty: '10', hargaPokokPerUnit: '1000000' }],
      });
    });
    const run = await withOwner(() => ob.post());

    const voided = await withOwner(() => ob.void('koreksi testing'));
    // Void = undo, bukan arsip terminal — run harus balik ke DRAFT (bukan
    // CANCELLED) supaya wizard tetap bisa dipakai lagi. SaldoAwal dibatasi
    // @@unique([tenantId]) — kalau run "mati" permanen di CANCELLED, tenant
    // ini tidak akan PERNAH bisa input saldo awal lagi (dead-end).
    expect(voided.status).toBe(InvoiceStatus.DRAFT);

    // Account.saldoAwal restored dari snapshot.
    const kasAfter = await superPrisma.account.findUnique({ where: { id: t.akun.kas } });
    expect(Number(kasAfter?.saldoAwal)).toBe(100_000_000);
    const modalAfter = await superPrisma.account.findUnique({ where: { id: t.akun.modal } });
    expect(Number(modalAfter?.saldoAwal)).toBe(130_000_000);

    // Invoice piutang/utang CANCELLED.
    const piutangInv = await superPrisma.salesInvoice.findFirst({ where: { saldoAwalId: run.id } });
    expect(piutangInv?.status).toBe(InvoiceStatus.CANCELLED);
    const utangInv = await superPrisma.purchaseInvoice.findFirst({ where: { saldoAwalId: run.id } });
    expect(utangInv?.status).toBe(InvoiceStatus.CANCELLED);

    // ItemStokAwal lepas dari run (bisa di-edit ulang).
    const isa = await superPrisma.itemStokAwal.findFirst({ where: { itemId } });
    expect(isa?.saldoAwalId).toBeNull();

    // Semua jurnal SALDO_AWAL untuk run ini REVERSED.
    const journals = await superPrisma.journal.findMany({ where: { sumber: 'SALDO_AWAL', sumberRef: run.id } });
    for (const j of journals) {
      expect(j.status).toBe(JournalStatus.REVERSED);
    }

    // Run harus genuinely re-usable — bukan cuma status yang bilang DRAFT
    // tapi sebenarnya masih terkunci. Coba tambah piutang baru & re-post.
    await withOwner(() =>
      ob.addPiutang({ customerId, cabangId: t.cabangId, tanggal: '2026-01-01', nominal: '80000000' }),
    );
    const preview2 = await withOwner(() => ob.preview());
    expect(preview2.status).toBe('DRAFT');
    expect(preview2.countPiutang).toBe(1);
  });

  // ----------------------------------------------------------------
  // Review ronde 2 — regresi bug yang ditemukan & diperbaiki:
  //  - MONEY: isSaldoAwal bypass lewat SalesService/PurchasesService.post()
  //  - TENANCY/IDOR: itemId lintas-tenant, cabang scoping list/remove
  //  - RACE: dua post() bersamaan tidak boleh dobel-posting
  // ----------------------------------------------------------------
  describe('Review ronde 2 — regresi bug', () => {
    it('SalesService.post()/PurchasesService.post() menolak invoice isSaldoAwal — wajib lewat wizard', async () => {
      await withOwner(() =>
        ob.addPiutang({ customerId, cabangId: t.cabangId, tanggal: '2026-01-01', nominal: '5000000' }),
      );
      const piutangInv = await superPrisma.salesInvoice.findFirst({ where: { customerId, isSaldoAwal: true } });
      await expect(
        withOwner(() => sales.post(piutangInv!.id)),
      ).rejects.toThrow(BadRequestException);
      // Tetap DRAFT — tidak ada jurnal nyasar yang terlanjur ke-posting.
      const afterAttempt = await superPrisma.salesInvoice.findUnique({ where: { id: piutangInv!.id } });
      expect(afterAttempt?.status).toBe(InvoiceStatus.DRAFT);
      expect(afterAttempt?.journalId).toBeNull();

      await withOwner(() =>
        ob.addUtang({ vendorId, cabangId: t.cabangId, tanggal: '2026-01-01', nominal: '3000000' }),
      );
      const utangInv = await superPrisma.purchaseInvoice.findFirst({ where: { vendorId, isSaldoAwal: true } });
      await expect(
        withOwner(() => purchases.post(utangInv!.id)),
      ).rejects.toThrow(BadRequestException);
      const utangAfter = await superPrisma.purchaseInvoice.findUnique({ where: { id: utangInv!.id } });
      expect(utangAfter?.status).toBe(InvoiceStatus.DRAFT);
    });

    it('setPersediaan menolak itemId yang bukan milik tenant ini', async () => {
      const otherTenant = await createTestTenant(prisma);
      const foreignItem = await superPrisma.item.create({
        data: {
          tenantId: otherTenant.tenantId, kode: 'BRG-FOREIGN', nama: 'Barang Tenant Lain',
          satuan: 'Pcs', hargaJualDefault: '5000', klasifikasiPpn: KlasifikasiPpn.BKP,
          akunPendapatanId: otherTenant.akun.pendapatan,
          akunPersediaanId: otherTenant.akun.persediaan,
          akunHppId: otherTenant.akun.hpp,
        },
      });
      await expect(
        withOwner(() =>
          ob.setPersediaan({
            lines: [{ itemId: foreignItem.id, cabangId: t.cabangId, tanggal: '2026-01-01', qty: '1', hargaPokokPerUnit: '1000' }],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      // Tidak ada ItemStokAwal nyasar yang ke-create menunjuk item tenant lain.
      const leaked = await superPrisma.itemStokAwal.findFirst({ where: { itemId: foreignItem.id } });
      expect(leaked).toBeNull();
    });

    it('listPiutang/listUtang/listPersediaan tidak bocor lintas cabang; remove* ditolak untuk cabang yang tidak diakses', async () => {
      const cabangB = await superPrisma.cabang.create({
        data: { tenantId: t.tenantId, kode: 'CAB-OB-B', nama: 'Cabang B', isPusat: false },
      });
      const piutangB = await withOwner(() =>
        ob.addPiutang({ customerId, cabangId: cabangB.id, tanggal: '2026-01-01', nominal: '1000000' }),
      );
      const utangB = await withOwner(() =>
        ob.addUtang({ vendorId, cabangId: cabangB.id, tanggal: '2026-01-01', nominal: '1000000' }),
      );
      await withOwner(() =>
        ob.setPersediaan({
          lines: [{ itemId, cabangId: cabangB.id, tanggal: '2026-01-01', qty: '1', hargaPokokPerUnit: '1000' }],
        }),
      );
      const persediaanB = await superPrisma.itemStokAwal.findFirst({ where: { cabangId: cabangB.id } });

      function restrictedCtx() {
        return { tenantId: t.tenantId, userId: t.userId, role: 'AKUNTAN', cabangIds: [t.cabangId] };
      }
      function withRestricted<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => ctx.run(restrictedCtx(), () => fn().then(resolve, reject)));
      }

      const piutangList = await withRestricted(() => ob.listPiutang());
      expect(piutangList.find((p) => p.id === piutangB.id)).toBeUndefined();
      const utangList = await withRestricted(() => ob.listUtang());
      expect(utangList.find((u) => u.id === utangB.id)).toBeUndefined();
      const persList = await withRestricted(() => ob.listPersediaan());
      expect(persList.find((p) => p.id === persediaanB!.id)).toBeUndefined();

      await expect(withRestricted(() => ob.removePiutang(piutangB.id))).rejects.toThrow(ForbiddenException);
      await expect(withRestricted(() => ob.removeUtang(utangB.id))).rejects.toThrow(ForbiddenException);
      await expect(withRestricted(() => ob.removePersediaan(persediaanB!.id))).rejects.toThrow(ForbiddenException);

      // Full-access owner tetap lihat & bisa hapus baris cabang B — bukti
      // ini murni pembatasan per-cabang, bukan bug lain yang menyamar.
      const ownerList = await withOwner(() => ob.listPiutang());
      expect(ownerList.find((p) => p.id === piutangB.id)).toBeDefined();
    });

    it('dua post() bersamaan pada run yang sama tidak menghasilkan jurnal dobel — yang kedua ditolak bersih', async () => {
      await withOwner(() =>
        ob.setAkunLines({
          lines: [
            { accountId: t.akun.kas, nilai: '10000000' },
            { accountId: t.akun.modal, nilai: '10000000' },
          ],
        }),
      );
      const preview = await withOwner(() => ob.preview());
      expect(preview.balanced).toBe(true);

      const results = await Promise.allSettled([
        withOwner(() => ob.post()),
        withOwner(() => ob.post()),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      // Salah satu berhasil, satunya ditolak BadRequestException BERSIH
      // (run sudah POSTED) — BUKAN P2002/500 mentah dari tabrakan create,
      // dan BUKAN dua-duanya berhasil (yang berarti dobel-posting).
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const rejection = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejection).toBeInstanceOf(BadRequestException);

      const run = await withOwner(() => ob.getRun());
      expect(run.status).toBe(InvoiceStatus.POSTED);
      const journals = await superPrisma.journal.findMany({
        where: { sumber: 'SALDO_AWAL', sumberRef: run.id },
      });
      // Cuma 1 jurnal "Saldo awal akun" (kas vs modal) — bukan 2.
      expect(journals).toHaveLength(1);
      expect(journals[0]!.status).toBe(JournalStatus.POSTED);
    });
  });

  it('post() ditolak kalau akun subsidiary (Piutang) punya saldo awal legacy nonzero; boleh lanjut setelah dinolkan via AccountsService', async () => {
    // Simulasi data legacy: t.akun.piutang di-set nonzero LANGSUNG (bukan
    // lewat wizard) — mis. dari sebelum fitur Saldo Awal Terintegrasi ada.
    await superPrisma.account.update({
      where: { id: t.akun.piutang }, data: { saldoAwal: '310000000' },
    });
    await withOwner(() =>
      ob.setAkunLines({
        lines: [
          { accountId: t.akun.kas, nilai: '5000000' },
          { accountId: t.akun.modal, nilai: '5000000' },
        ],
      }),
    );
    const preview = await withOwner(() => ob.preview());
    expect(preview.balanced).toBe(true); // akun manual sendiri sudah balance

    // post() harus TETAP ditolak — akun Piutang subsidiary masih punya
    // saldo legacy yang belum direkonsiliasi, walau preview bilang balanced.
    await expect(withOwner(() => ob.post())).rejects.toThrow(/Piutang/i);

    // Escape hatch: nolkan lewat AccountsService.update() (target PERSIS 0).
    const piutangAcc = await superPrisma.account.findUnique({ where: { id: t.akun.piutang } });
    await withOwner(() =>
      accounts.update(t.akun.piutang, {
        kode: piutangAcc!.kode, nama: piutangAcc!.nama,
        isPostable: true, isActive: true, saldoAwal: '0',
      } as any),
    );

    // Sekarang post() boleh lanjut.
    const run = await withOwner(() => ob.post());
    expect(run.status).toBe(InvoiceStatus.POSTED);
  });
});
