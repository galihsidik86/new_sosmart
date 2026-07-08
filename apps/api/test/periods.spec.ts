/**
 * Integration test untuk PeriodsService (R2, EVALUASI.md).
 *
 * Cakupan: race condition (TOCTOU) antara posting jurnal dan tutup periode.
 * Sebelum fix, `assertOpen`/`createDraftInTx`/`reverseInTx` baca status
 * periode tanpa lock — dua transaksi bersamaan (post jurnal + closePeriod
 * pada periode yang sama) bisa sama-sama baca status OPEN sebelum salah
 * satu commit, sehingga jurnal bisa ke-POST ke periode yang sudah CLOSED.
 * Setelah fix (shared/exclusive advisory lock per periode), mutual exclusion
 * memaksa SALAH SATU urutan commit yang konsisten:
 *   (a) post menang duluan → commit dulu (POSTED) → baru closePeriod jalan
 *       (CLOSED) — postedAt harus <= closedAt.
 *   (b) closePeriod menang duluan → commit dulu (CLOSED) → post() re-fetch
 *       status fresh, ketolak ForbiddenException, jurnal tetap DRAFT.
 * Interleaving lain (jurnal POSTED tapi postedAt SETELAH closedAt, atau
 * jurnal POSTED padahal periode CLOSED tanpa error) TIDAK boleh terjadi.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FiscalYearStatus, JournalStatus, PeriodStatus } from '@lentera/db';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { JournalsService } from '../src/modules/journals/journals.service.js';
import { PeriodsService } from '../src/modules/periods/periods.service.js';
import { bootApp, createTestTenant, resetDb, superPrisma } from './helpers.js';

describe('PeriodsService — integration', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let journals: JournalsService;
  let periods: PeriodsService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    journals = app.get(JournalsService);
    periods = app.get(PeriodsService);
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
  });

  it('post() jurnal & closePeriod() ditembak bersamaan pada periode yang sama — tidak boleh ada jurnal POSTED yang lolos ke periode CLOSED', async () => {
    // Periode Januari (no=1) — dipilih supaya tidak kena chain-rule closePeriod
    // ("periode sebelumnya harus CLOSED dulu"), yang tidak relevan dgn race
    // yang mau dites di sini.
    const periodeJan = await superPrisma.fiscalPeriod.findFirst({
      where: { tenantId: t.tenantId, no: 1 },
    });
    expect(periodeJan).not.toBeNull();

    const draft = await withOwner(() =>
      journals.createDraft({
        cabangId: t.cabangId,
        tanggal: '2026-01-15',
        deskripsi: 'Jurnal race test',
        sumber: 'MANUAL',
        lines: [
          { accountId: t.akun.kas, debit: '100000', kredit: '0' },
          { accountId: t.akun.modal, debit: '0', kredit: '100000' },
        ],
      }),
    );

    const [postResult, closeResult] = await Promise.allSettled([
      withOwner(() => journals.post(draft.id)),
      withOwner(() => periods.closePeriod(periodeJan!.id, 'tutup periode race test')),
    ]);

    // closePeriod tidak bergantung sama sekali pada hasil post() — harus
    // selalu berhasil terlepas dari urutan race.
    expect(closeResult.status).toBe('fulfilled');
    const periodeAfter = await superPrisma.fiscalPeriod.findUnique({ where: { id: periodeJan!.id } });
    expect(periodeAfter?.status).toBe(PeriodStatus.CLOSED);
    expect(periodeAfter?.closedAt).not.toBeNull();

    const journalAfter = await superPrisma.journal.findUnique({ where: { id: draft.id } });

    if (postResult.status === 'fulfilled') {
      // Post menang lock duluan — HARUS commit sebelum closePeriod dapat
      // lock exclusive (mutual exclusion memaksa urutan commit), jadi
      // postedAt tidak boleh SETELAH closedAt.
      expect(journalAfter?.status).toBe(JournalStatus.POSTED);
      expect(journalAfter!.postedAt).not.toBeNull();
      expect(journalAfter!.postedAt!.getTime()).toBeLessThanOrEqual(periodeAfter!.closedAt!.getTime());
    } else {
      // closePeriod menang duluan — post() HARUS baca status CLOSED yang
      // fresh (bukan status basi dari sebelum menunggu lock) dan ditolak
      // bersih, bukan lolos POST ke periode yang sudah tutup.
      expect((postResult as PromiseRejectedResult).reason).toBeInstanceOf(ForbiddenException);
      expect(journalAfter?.status).toBe(JournalStatus.DRAFT);
    }
  });

  describe('createFiscalYear', () => {
    it('bikin tahun buku baru + 12 periode berturut-turut dengan label & rentang tanggal benar', async () => {
      const fy = await withOwner(() =>
        periods.createFiscalYear({ kode: '2027', startDate: '2027-01-01' }),
      );
      expect(fy.kode).toBe('2027');
      expect(fy.status).toBe(FiscalYearStatus.OPEN);
      expect(fy.startDate.toISOString().slice(0, 10)).toBe('2027-01-01');
      expect(fy.endDate.toISOString().slice(0, 10)).toBe('2027-12-31');
      expect(fy.periods).toHaveLength(12);
      expect(fy.periods[0]!.no).toBe(1);
      expect(fy.periods[0]!.label).toBe('Januari 2027');
      expect(fy.periods[0]!.startDate.toISOString().slice(0, 10)).toBe('2027-01-01');
      expect(fy.periods[0]!.status).toBe(PeriodStatus.OPEN);
      expect(fy.periods[11]!.no).toBe(12);
      expect(fy.periods[11]!.label).toBe('Desember 2027');
      expect(fy.periods[11]!.endDate.toISOString().slice(0, 10)).toBe('2027-12-31');
    });

    it('boleh membuat tahun buku sebelumnya (backfill historis) walau tahun ini (2026) masih OPEN', async () => {
      // Tidak ada chain-rule terhadap tutup/buka tahun lain — beda dari
      // closeFiscalYear yang memang harus berurutan.
      const fy = await withOwner(() =>
        periods.createFiscalYear({ kode: '2025', startDate: '2025-01-01' }),
      );
      expect(fy.endDate.toISOString().slice(0, 10)).toBe('2025-12-31');
      expect(fy.periods).toHaveLength(12);
    });

    it('menolak kode tahun buku yang sudah dipakai', async () => {
      // t (createTestTenant) sudah bikin FiscalYear kode "2026".
      await expect(
        withOwner(() => periods.createFiscalYear({ kode: '2026', startDate: '2030-01-01' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('menolak rentang tanggal yang tumpang tindih dengan tahun buku lain', async () => {
      // t sudah punya tahun buku 2026 (2026-01-01 — 2026-12-31); mulai
      // Juni 2026 pasti beririsan walau kode-nya beda.
      await expect(
        withOwner(() => periods.createFiscalYear({ kode: '2026B', startDate: '2026-06-01' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('tahun buku non-kalender (mulai Juli) — periode rollover ke tahun berikutnya dengan benar', async () => {
      const fy = await withOwner(() =>
        periods.createFiscalYear({ kode: '2028/2029', startDate: '2028-07-01' }),
      );
      expect(fy.endDate.toISOString().slice(0, 10)).toBe('2029-06-30');
      expect(fy.periods[5]!.label).toBe('Desember 2028'); // no=6
      expect(fy.periods[6]!.label).toBe('Januari 2029'); // no=7
      expect(fy.periods[6]!.startDate.toISOString().slice(0, 10)).toBe('2029-01-01');
    });
  });
});
