/**
 * Integration test untuk BudgetGuardService (R1, EVALUASI.md).
 *
 * Cakupan:
 *  - Enforcement normal: 1 jurnal yang sendirian menembus limit hardBlock
 *    ditolak, jurnal di bawah limit lolos.
 *  - Race condition (TOCTOU) yang jadi alasan R1: 2 jurnal ditembak nyaris
 *    bersamaan, sama-sama menyentuh bucket (project, account, bulan) yang
 *    sama, dengan limit yang PAS supaya kalau race lolos (baca "spent"
 *    sebelum salah satu commit), KEDUANYA akan lolos hard-block padahal
 *    totalnya menembus limit. Setelah fix (pg_advisory_xact_lock per bucket,
 *    dikunci di awal check() sebelum baca nilai), HARUS ada yang ditolak.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { JournalStatus } from '@lentera/db';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { JournalsService } from '../src/modules/journals/journals.service.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { BudgetExceededException } from '../src/modules/projects/budget-guard.service.js';
import { bootApp, createTestTenant, resetDb, superPrisma } from './helpers.js';

describe('BudgetGuardService — integration', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let journals: JournalsService;
  let projects: ProjectsService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;
  let projectId: string;

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    journals = app.get(JournalsService);
    projects = app.get(ProjectsService);
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
    const project = await withOwner(() =>
      projects.create({ kode: 'PRJ-BUDGET', nama: 'Proyek Budget Test', tanggalMulai: '2026-01-01' }),
    );
    projectId = project.id;
    await withOwner(() =>
      projects.setBudget({
        projectId, accountId: t.akun.bebanGaji, periode: '2026-05',
        amount: '1000000', hardBlock: true,
      }),
    );
  });

  function bebanJurnal(tanggal: string, debit: string) {
    return withOwner(() =>
      journals.createDraft({
        cabangId: t.cabangId,
        tanggal,
        deskripsi: `Beban proyek ${tanggal}`,
        sumber: 'MANUAL',
        lines: [
          { accountId: t.akun.bebanGaji, projectId, debit, kredit: '0' },
          { accountId: t.akun.kas, debit: '0', kredit: debit },
        ],
      }),
    );
  }

  it('enforcement normal (non-race): jurnal sendirian yang menembus limit hardBlock ditolak, di bawah limit lolos', async () => {
    const kecil = await bebanJurnal('2026-05-10', '600000');
    await expect(withOwner(() => journals.post(kecil.id))).resolves.toMatchObject({
      status: JournalStatus.POSTED,
    });

    const besar = await bebanJurnal('2026-05-11', '900000'); // 600rb + 900rb = 1.5jt > 1jt limit
    await expect(withOwner(() => journals.post(besar.id))).rejects.toThrow(BudgetExceededException);
  });

  it('dua jurnal ditembak bersamaan menyentuh bucket budget yang sama — TIDAK boleh dua-duanya lolos hard-block', async () => {
    // Masing-masing 700rb sendirian di bawah limit 1jt, tapi gabungan 1.4jt
    // menembus. Kalau race lolos (baca "spent" sebelum salah satu commit),
    // dua-duanya akan lolos hard-block.
    const d1 = await bebanJurnal('2026-05-15', '700000');
    const d2 = await bebanJurnal('2026-05-16', '700000');

    const results = await Promise.allSettled([
      withOwner(() => journals.post(d1.id)),
      withOwner(() => journals.post(d2.id)),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BudgetExceededException);

    // Total yang benar-benar POSTED di bucket ini tidak boleh menembus limit.
    const agg = await superPrisma.journalLine.aggregate({
      where: {
        accountId: t.akun.bebanGaji, projectId,
        journal: { status: JournalStatus.POSTED },
      },
      _sum: { debit: true },
    });
    expect(Number(agg._sum.debit ?? 0)).toBeLessThanOrEqual(1_000_000);
  });
});
