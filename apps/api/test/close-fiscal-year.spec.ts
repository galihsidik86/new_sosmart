/**
 * Integration test untuk Tutup Buku Akhir Tahun (FiscalYearClosingService).
 *
 * Cakupan:
 *  - Precondition ditolak: periode belum semua closed.
 *  - Jurnal penutup benar: D=K, arah closing per akun ikut normalBalance
 *    (termasuk akun kontra — Retur Penjualan kind=PENDAPATAN tapi
 *    normalBalance=DEBIT — closing-nya harus KREDIT, bukan DEBIT).
 *  - Laba Ditahan (3-102) bertambah tepat sebesar laba bersih yang benar
 *    (dihitung manual di test, BUKAN dibandingkan ke LabaRugiService untuk
 *    skenario yang punya akun kontra — lihat catatan di bawah).
 *  - Regresi kunci: setelah tutup buku, LabaRugiService untuk tahun buku
 *    BERIKUTNYA mulai dari nol (tidak mewarisi mutasi tahun sebelumnya).
 *  - NeracaService tahun berikutnya: Ekuitas mencakup laba yang sudah
 *    dipindah ke 3-102, laba berjalan tahun baru dihitung terpisah.
 *  - Reopen: jurnal REVERSED, periode & tahun kembali OPEN, reusable.
 *  - Reopen ditolak kalau tahun berikutnya sudah punya periode closed.
 *
 * CATATAN (sudah diperbaiki, review ronde 3): dulu `LabaRugiService`,
 * `NeracaService`, `PerubahanEkuitasService`, dan `ArusKasService` (4 file
 * independen) menjumlah `mutasiSigned()` langsung per KIND tanpa koreksi
 * untuk akun kontra (mis. Retur Penjualan kind=PENDAPATAN tapi
 * normalBalance=DEBIT) — nilainya ikut DITAMBAH bukan DIKURANG, jadi
 * keempat laporan itu melaporkan laba lebih tinggi dari yang sebenarnya
 * kalau ada retur/potongan. Sudah diperbaiki lewat helper bersama
 * `plKindContribution()` (apps/api/src/modules/reports/helpers.ts), yang
 * sign-nya murni dari normalBalance per akun — sama seperti
 * FiscalYearClosingService yang dari awal sudah benar. Sekarang kelima
 * angka (LabaRugi/Neraca/PerubahanEkuitas/ArusKas/FiscalYearClosing)
 * dipastikan SAMA PERSIS lewat assertion cross-report di bawah, bukan
 * cuma dihitung manual terpisah seperti sebelumnya.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { FiscalYearClosingService } from '../src/modules/fiscal-year/fiscal-year-closing.service.js';
import { FiscalYearClosingModule } from '../src/modules/fiscal-year/fiscal-year-closing.module.js';
import { JournalsService } from '../src/modules/journals/journals.service.js';
import { LabaRugiService } from '../src/modules/reports/laba-rugi.service.js';
import { NeracaService } from '../src/modules/reports/neraca.service.js';
import { PerubahanEkuitasService } from '../src/modules/reports/perubahan-ekuitas.service.js';
import { ArusKasService } from '../src/modules/reports/arus-kas.service.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';
import { TrialBalanceService } from '../src/modules/ledger/trial-balance.service.js';
import { LedgerModule } from '../src/modules/ledger/ledger.module.js';
import { bootApp, createTestTenant, resetDb, superPrisma } from './helpers.js';
import {
  AccountKind,
  FiscalYearStatus,
  JournalStatus,
  NormalBalance,
  PeriodStatus,
} from '@lentera/db';

describe('FiscalYearClosingService — integration', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let closing: FiscalYearClosingService;
  let journals: JournalsService;
  let labaRugi: LabaRugiService;
  let neraca: NeracaService;
  let perubahanEkuitas: PerubahanEkuitasService;
  let arusKas: ArusKasService;
  let trialBalance: TrialBalanceService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;
  let labaDitahanId: string;
  let returId: string;

  beforeAll(async () => {
    app = await bootApp([FiscalYearClosingModule, ReportsModule, LedgerModule]);
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    closing = app.get(FiscalYearClosingService);
    journals = app.get(JournalsService);
    labaRugi = app.get(LabaRugiService);
    neraca = app.get(NeracaService);
    perubahanEkuitas = app.get(PerubahanEkuitasService);
    arusKas = app.get(ArusKasService);
    trialBalance = app.get(TrialBalanceService);
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
    const laba = await superPrisma.account.create({
      data: {
        tenantId: t.tenantId, kode: '3-102', nama: 'Laba Ditahan',
        kind: AccountKind.EKUITAS, normalBalance: NormalBalance.KREDIT, isPostable: true,
      },
    });
    labaDitahanId = laba.id;
    const retur = await superPrisma.account.create({
      data: {
        tenantId: t.tenantId, kode: '4-103', nama: 'Retur Penjualan',
        kind: AccountKind.PENDAPATAN, normalBalance: NormalBalance.DEBIT, isPostable: true,
      },
    });
    // Dibutuhkan GlConfigService.getAccountIdInTx (fallback ke kode default)
    // untuk PerubahanEkuitasService (DIVIDEN) / ArusKasService (BEBAN_PENYUSUTAN)
    // — 0 mutasi di test ini, cuma supaya kedua service itu tidak throw
    // NotFoundException saat resolve akun.
    await superPrisma.account.create({
      data: {
        tenantId: t.tenantId, kode: '3-104', nama: 'Prive/Dividen',
        kind: AccountKind.EKUITAS, normalBalance: NormalBalance.DEBIT, isPostable: true,
      },
    });
    await superPrisma.account.create({
      data: {
        tenantId: t.tenantId, kode: '6-103', nama: 'Beban Penyusutan',
        kind: AccountKind.BEBAN, normalBalance: NormalBalance.DEBIT, isPostable: true,
      },
    });
    returId = retur.id;
  });

  /** Post + langsung POSTED, 1 jurnal 2 baris. */
  async function postJournal(tanggal: string, deskripsi: string, lines: Array<{ accountId: string; debit: string; kredit: string }>) {
    return withOwner(async () => {
      const draft = await journals.createDraft({
        cabangId: t.cabangId, tanggal, deskripsi, sumber: 'MANUAL', lines,
      });
      return journals.post(draft.id);
    });
  }

  /** Tutup periode 1..11 langsung via SQL (data setup, bukan yang diuji di sini). */
  async function closeFirst11Periods() {
    await superPrisma.fiscalPeriod.updateMany({
      where: { tenantId: t.tenantId, no: { lt: 12 } },
      data: { status: PeriodStatus.CLOSED, closedAt: new Date() },
    });
  }

  it('closeFiscalYear: ditolak kalau periode belum semua closed', async () => {
    // Tidak ada periode yang ditutup sama sekali.
    await expect(
      withOwner(() => closing.closeFiscalYear(t.fiscalYearId)),
    ).rejects.toThrow(BadRequestException);

    // Tutup sebagian (cuma Jan-Okt), Nov masih OPEN, Des juga OPEN — masih ditolak.
    await superPrisma.fiscalPeriod.updateMany({
      where: { tenantId: t.tenantId, no: { lt: 11 } },
      data: { status: PeriodStatus.CLOSED, closedAt: new Date() },
    });
    await expect(
      withOwner(() => closing.closeFiscalYear(t.fiscalYearId)),
    ).rejects.toThrow(/November/);
  });

  it('closeFiscalYear: jurnal penutup benar (D=K, arah akun kontra benar), Laba Ditahan sesuai laba bersih yang benar', async () => {
    // Revenue 10jt, HPP 4jt, Beban Gaji 2jt, Retur Penjualan 500rb (kontra —
    // normalBalance DEBIT walau kind PENDAPATAN).
    // Laba bersih yang BENAR = 10jt - 500rb - 4jt - 2jt = 3.5jt.
    await postJournal('2026-03-15', 'Penjualan Maret', [
      { accountId: t.akun.piutang, debit: '10000000', kredit: '0' },
      { accountId: t.akun.pendapatan, debit: '0', kredit: '10000000' },
    ]);
    await postJournal('2026-03-15', 'HPP Maret', [
      { accountId: t.akun.hpp, debit: '4000000', kredit: '0' },
      { accountId: t.akun.persediaan, debit: '0', kredit: '4000000' },
    ]);
    await postJournal('2026-04-10', 'Retur penjualan', [
      { accountId: returId, debit: '500000', kredit: '0' },
      { accountId: t.akun.piutang, debit: '0', kredit: '500000' },
    ]);
    await postJournal('2026-05-01', 'Gaji Mei', [
      { accountId: t.akun.bebanGaji, debit: '2000000', kredit: '0' },
      { accountId: t.akun.kas, debit: '0', kredit: '2000000' },
    ]);

    // --- Cross-report consistency check untuk akun kontra (Retur Penjualan)
    // — dicek SEBELUM tutup buku (P&L belum dinolkan), supaya ke-4 laporan
    // yang masing-masing agregasi P&L sendiri (LabaRugi/Neraca/PerubahanEkuitas/
    // ArusKas) semua menghasilkan angka yang SAMA PERSIS dan konsisten
    // dengan closing entry FiscalYearClosingService di bawah (3.5jt).
    const desemberBefore = await superPrisma.fiscalPeriod.findFirst({
      where: { tenantId: t.tenantId, no: 12 },
    });
    const lr = await withOwner(() => labaRugi.build({ periodId: desemberBefore!.id, ytd: true }));
    expect(lr.pendapatan.total).toBe('9500000.00'); // 10jt - 500rb retur
    const returRow = lr.pendapatan.rows.find((r) => r.id === returId);
    expect(returRow?.nilai).toBe('-500000.00'); // baris kontra tampil negatif, bukan +500rb
    expect(lr.labaKotor.nilai).toBe('5500000.00'); // 9.5jt - 4jt HPP
    expect(lr.labaUsaha.nilai).toBe('3500000.00'); // 5.5jt - 2jt gaji
    expect(lr.labaBersih.nilai).toBe('3500000.00');

    const nr = await withOwner(() => neraca.build({ periodId: desemberBefore!.id }));
    expect(nr.labaBerjalan.nilai).toBe('3500000.00');
    expect(nr.balanced).toBe(true);

    const pe = await withOwner(() => perubahanEkuitas.build({ periodId: desemberBefore!.id }));
    expect(pe.labaBersih).toBe('3500000.00');

    const ak = await withOwner(() => arusKas.build({ periodId: desemberBefore!.id }));
    const labaBersihArusKasRow = ak.operasi.rows.find((r) => r.label === 'Laba Bersih');
    expect(labaBersihArusKasRow?.nilai).toBe('3500000.00');

    await closeFirst11Periods();

    const result = await withOwner(() => closing.closeFiscalYear(t.fiscalYearId, 'Tutup 2026'));
    expect(result.status).toBe(FiscalYearStatus.CLOSED);
    expect(result.labaBersih).toBe('3500000.00');

    const fyAfter = await superPrisma.fiscalYear.findUnique({ where: { id: t.fiscalYearId } });
    expect(fyAfter?.status).toBe(FiscalYearStatus.CLOSED);
    expect(fyAfter?.catatanTutup).toBe('Tutup 2026');

    const desember = await superPrisma.fiscalPeriod.findFirst({ where: { tenantId: t.tenantId, no: 12 } });
    expect(desember?.status).toBe(PeriodStatus.CLOSED);

    const closingJournal = await superPrisma.journal.findFirst({
      where: { tenantId: t.tenantId, sumber: 'TUTUP_BUKU', sumberRef: t.fiscalYearId },
      include: { lines: true },
    });
    expect(closingJournal).not.toBeNull();
    expect(closingJournal!.status).toBe(JournalStatus.POSTED);
    expect(closingJournal!.totalDebit.toString()).toBe(closingJournal!.totalKredit.toString());

    const lineFor = (accountId: string) => closingJournal!.lines.find((l) => l.accountId === accountId);
    // Pendapatan (KREDIT normal, saldo kredit 10jt) → closing DEBIT 10jt.
    expect(lineFor(t.akun.pendapatan)?.debit.toString()).toBe('10000000');
    expect(lineFor(t.akun.pendapatan)?.kredit.toString()).toBe('0');
    // Retur (DEBIT normal, saldo debit 500rb) → closing KREDIT 500rb (BUKAN debit).
    expect(lineFor(returId)?.kredit.toString()).toBe('500000');
    expect(lineFor(returId)?.debit.toString()).toBe('0');
    // HPP (DEBIT normal) → closing KREDIT 4jt.
    expect(lineFor(t.akun.hpp)?.kredit.toString()).toBe('4000000');
    // Beban Gaji (DEBIT normal) → closing KREDIT 2jt.
    expect(lineFor(t.akun.bebanGaji)?.kredit.toString()).toBe('2000000');
    // Laba Ditahan (KREDIT normal, laba positif) → closing KREDIT 3.5jt.
    expect(lineFor(labaDitahanId)?.kredit.toString()).toBe('3500000');
    expect(lineFor(labaDitahanId)?.debit.toString()).toBe('0');

    // Saldo GL akun Laba Ditahan sekarang 3.5jt (kredit).
    const ldLines = await superPrisma.journalLine.aggregate({
      where: { accountId: labaDitahanId, journal: { status: JournalStatus.POSTED } },
      _sum: { debit: true, kredit: true },
    });
    const saldoLd = Number(ldLines._sum.kredit ?? 0) - Number(ldLines._sum.debit ?? 0);
    expect(saldoLd).toBe(3_500_000);

    // --- Regresi kunci: tahun buku BERIKUTNYA mulai dari nol ---
    const fy2027 = await superPrisma.fiscalYear.create({
      data: {
        tenantId: t.tenantId, kode: '2027',
        startDate: new Date(Date.UTC(2027, 0, 1)), endDate: new Date(Date.UTC(2027, 11, 31)),
        status: FiscalYearStatus.OPEN,
      },
    });
    const jan2027 = await superPrisma.fiscalPeriod.create({
      data: {
        tenantId: t.tenantId, fiscalYearId: fy2027.id, no: 1, label: 'Januari 2027',
        startDate: new Date(Date.UTC(2027, 0, 1)), endDate: new Date(Date.UTC(2027, 0, 31)),
        status: PeriodStatus.OPEN,
      },
    });
    await postJournal('2027-01-10', 'Penjualan Jan 2027', [
      { accountId: t.akun.piutang, debit: '1000000', kredit: '0' },
      { accountId: t.akun.pendapatan, debit: '0', kredit: '1000000' },
    ]);

    const lr2027 = await withOwner(() => labaRugi.build({ periodId: jan2027.id }));
    // Cuma 1jt dari Jan 2027 — TIDAK mewarisi 10jt dari 2026 (sudah dinolkan
    // jurnal penutup, dan mutasiSigned hanya baca rentang tanggal periode).
    expect(lr2027.pendapatan.total).toBe('1000000.00');
    expect(lr2027.labaBersih.nilai).toBe('1000000.00');

    const nr2027 = await withOwner(() => neraca.build({ periodId: jan2027.id }));
    const ldRow = nr2027.ekuitas.rows.find((r) => r.id === labaDitahanId);
    expect(ldRow?.nilai).toBe('3500000.00');
    // Laba berjalan 2027 cuma dari aktivitas 2027 (1jt), terpisah dari 3-102.
    expect(nr2027.labaBerjalan.nilai).toBe('1000000.00');
    expect(nr2027.balanced).toBe(true);
  });

  it('reopenFiscalYear: jurnal REVERSED, periode & tahun OPEN lagi', async () => {
    await postJournal('2026-03-15', 'Penjualan Maret', [
      { accountId: t.akun.piutang, debit: '5000000', kredit: '0' },
      { accountId: t.akun.pendapatan, debit: '0', kredit: '5000000' },
    ]);
    await closeFirst11Periods();
    await withOwner(() => closing.closeFiscalYear(t.fiscalYearId));

    const closingJournalBefore = await superPrisma.journal.findFirst({
      where: { tenantId: t.tenantId, sumber: 'TUTUP_BUKU', sumberRef: t.fiscalYearId },
    });
    expect(closingJournalBefore?.status).toBe(JournalStatus.POSTED);

    await withOwner(() => closing.reopenFiscalYear(t.fiscalYearId, 'Koreksi audit'));

    const fyAfter = await superPrisma.fiscalYear.findUnique({ where: { id: t.fiscalYearId } });
    expect(fyAfter?.status).toBe(FiscalYearStatus.OPEN);
    expect(fyAfter?.catatanTutup).toBe('Koreksi audit');

    const desember = await superPrisma.fiscalPeriod.findFirst({ where: { tenantId: t.tenantId, no: 12 } });
    expect(desember?.status).toBe(PeriodStatus.OPEN);

    const closingJournalAfter = await superPrisma.journal.findUnique({ where: { id: closingJournalBefore!.id } });
    expect(closingJournalAfter?.status).toBe(JournalStatus.REVERSED);

    // Saldo Laba Ditahan balik ke 0 setelah reversal — dicek lewat
    // TrialBalanceService (jalur produksi asli, bukan raw query), yang
    // sekarang menghitung saldo dengan benar (include jurnal REVERSED
    // bersama jurnal pembaliknya, lihat JOURNAL_BALANCE_STATUSES).
    const tb = await withOwner(() => trialBalance.build({ periodId: desember!.id }));
    const ldRow = tb.rows.find((r) => r.accountId === labaDitahanId);
    expect(ldRow?.saldoAkhirDebit).toBe('0.00');
    expect(ldRow?.saldoAkhirKredit).toBe('0.00');
  });

  it('reopenFiscalYear: ditolak kalau tahun buku berikutnya sudah punya periode closed', async () => {
    await closeFirst11Periods();
    await withOwner(() => closing.closeFiscalYear(t.fiscalYearId));

    const fy2027 = await superPrisma.fiscalYear.create({
      data: {
        tenantId: t.tenantId, kode: '2027',
        startDate: new Date(Date.UTC(2027, 0, 1)), endDate: new Date(Date.UTC(2027, 11, 31)),
        status: FiscalYearStatus.OPEN,
      },
    });
    await superPrisma.fiscalPeriod.create({
      data: {
        tenantId: t.tenantId, fiscalYearId: fy2027.id, no: 1, label: 'Januari 2027',
        startDate: new Date(Date.UTC(2027, 0, 1)), endDate: new Date(Date.UTC(2027, 0, 31)),
        status: PeriodStatus.CLOSED, closedAt: new Date(),
      },
    });

    await expect(
      withOwner(() => closing.reopenFiscalYear(t.fiscalYearId, 'coba buka lagi')),
    ).rejects.toThrow(/2027/);
  });
});
