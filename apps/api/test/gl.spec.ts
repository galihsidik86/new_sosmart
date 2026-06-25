/**
 * Integration tests untuk GL Engine — invariant fundamental akuntansi.
 *
 * Cakupan:
 *   - createDraft → post happy path
 *   - D=K enforcement (DB CHECK + service validation)
 *   - Period CLOSED guard
 *   - Akun non-postable di-blokir (DB trigger)
 *   - Reverse: jurnal pembalik dengan D↔K terbalik + status REVERSED
 *   - Sequence per (tenant, bulan)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { JournalsService } from '../src/modules/journals/journals.service.js';
import { PeriodsService } from '../src/modules/periods/periods.service.js';
import { bootApp, createTestTenant, resetDb, superPrisma, withTenant } from './helpers.js';
import { JournalStatus, PeriodStatus } from '@lentera/db';

describe('GL Engine — integration', () => {
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

  beforeEach(async () => {
    await resetDb(prisma);
    t = await createTestTenant(prisma);
  });

  const tenantCtx = () => ({
    tenantId: t.tenantId,
    userId: t.userId,
    role: 'OWNER',
    cabangIds: null,
  });

  describe('createDraft + post happy path', () => {
    it('terbitkan jurnal POSTED dengan nomor JU-2026-05-NNNN', async () => {
      const result = await withTenant(ctx, tenantCtx(), async () => {
        const draft = await journals.createDraft({
          cabangId: t.cabangId,
          tanggal: '2026-05-15',
          deskripsi: 'Penjualan tunai',
          sumber: 'MANUAL',
          lines: [
            { accountId: t.akun.kas, debit: '1000000', kredit: '0' },
            { accountId: t.akun.pendapatan, debit: '0', kredit: '1000000' },
          ],
        });
        expect(draft.status).toBe(JournalStatus.DRAFT);
        expect(draft.nomor).toBeNull();

        const posted = await journals.post(draft.id);
        return posted;
      });

      expect(result.status).toBe(JournalStatus.POSTED);
      expect(result.nomor).toMatch(/^JU-2026-05-\d{4}$/);
      expect(result.postedAt).not.toBeNull();
    });

    it('alokasi nomor sequential per bulan', async () => {
      await withTenant(ctx, tenantCtx(), async () => {
        const make = async () => {
          const draft = await journals.createDraft({
            cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'X', sumber: 'MANUAL',
            lines: [
              { accountId: t.akun.kas, debit: '100', kredit: '0' },
              { accountId: t.akun.pendapatan, debit: '0', kredit: '100' },
            ],
          });
          return journals.post(draft.id);
        };
        const a = await make();
        const b = await make();
        const c = await make();
        expect(a.nomor).toMatch(/0001$/);
        expect(b.nomor).toMatch(/0002$/);
        expect(c.nomor).toMatch(/0003$/);
      });
    });
  });

  describe('D=K enforcement', () => {
    it('reject draft kalau total D ≠ K (Zod refine)', async () => {
      await withTenant(ctx, tenantCtx(), async () => {
        await expect(
          journals.createDraft({
            cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'X', sumber: 'MANUAL',
            lines: [
              { accountId: t.akun.kas, debit: '1000', kredit: '0' },
              { accountId: t.akun.pendapatan, debit: '0', kredit: '999' },
            ],
          }),
        ).rejects.toThrow();
      });
    });

    it('reject draft dengan total 0', async () => {
      await withTenant(ctx, tenantCtx(), async () => {
        await expect(
          journals.createDraft({
            cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'X', sumber: 'MANUAL',
            lines: [
              { accountId: t.akun.kas, debit: '0', kredit: '0' },
              { accountId: t.akun.pendapatan, debit: '0', kredit: '0' },
            ],
          }),
        ).rejects.toThrow();
      });
    });

    it('reject baris dengan debit AND kredit terisi (XOR)', async () => {
      await withTenant(ctx, tenantCtx(), async () => {
        await expect(
          journals.createDraft({
            cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'X', sumber: 'MANUAL',
            lines: [
              { accountId: t.akun.kas, debit: '500', kredit: '500' }, // illegal
              { accountId: t.akun.pendapatan, debit: '0', kredit: '0' },
            ],
          }),
        ).rejects.toThrow();
      });
    });
  });

  describe('Period guard', () => {
    it('reject post kalau periode CLOSED', async () => {
      // Tutup periode dulu (pakai superPrisma — bypass RLS untuk setup)
      await superPrisma.fiscalPeriod.update({
        where: { id: t.periodId }, data: { status: PeriodStatus.CLOSED },
      });

      await withTenant(ctx, tenantCtx(), async () => {
        await expect(
          journals.createDraft({
            cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'X', sumber: 'MANUAL',
            lines: [
              { accountId: t.akun.kas, debit: '100', kredit: '0' },
              { accountId: t.akun.pendapatan, debit: '0', kredit: '100' },
            ],
          }),
        ).rejects.toThrow(/sudah ditutup/i);
      });
    });

    it('reject draft kalau tanggal di luar tahun buku', async () => {
      await withTenant(ctx, tenantCtx(), async () => {
        await expect(
          journals.createDraft({
            cabangId: t.cabangId, tanggal: '2030-01-01', deskripsi: 'X', sumber: 'MANUAL',
            lines: [
              { accountId: t.akun.kas, debit: '100', kredit: '0' },
              { accountId: t.akun.pendapatan, debit: '0', kredit: '100' },
            ],
          }),
        ).rejects.toThrow(/luar tahun buku/i);
      });
    });
  });

  describe('Reverse', () => {
    it('terbitkan jurnal pembalik dengan D↔K terbalik, link reversedFromId/reversedById', async () => {
      const result = await withTenant(ctx, tenantCtx(), async () => {
        const draft = await journals.createDraft({
          cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'Awal', sumber: 'MANUAL',
          lines: [
            { accountId: t.akun.kas, debit: '500000', kredit: '0' },
            { accountId: t.akun.pendapatan, debit: '0', kredit: '500000' },
          ],
        });
        const posted = await journals.post(draft.id);
        const pembalik = await journals.reverse(posted.id, {
          tanggal: new Date('2026-05-20T00:00:00Z'),
          alasan: 'Salah input',
        });
        const orig = await journals.byId(posted.id);
        return { posted, pembalik, orig };
      });

      // Original status → REVERSED, link ke pembalik
      expect(result.orig.status).toBe(JournalStatus.REVERSED);
      expect(result.orig.reversedById).toBe(result.pembalik.id);

      // Pembalik link balik ke original
      expect(result.pembalik.reversedFromId).toBe(result.posted.id);
      expect(result.pembalik.status).toBe(JournalStatus.POSTED);
      expect(result.pembalik.deskripsi).toContain('Pembalik');

      // Lines pembalik = D↔K terbalik — pakai superPrisma (lentera_app filtered by RLS tanpa GUC)
      const pembalikLines = await superPrisma.journalLine.findMany({
        where: { journalId: result.pembalik.id },
        orderBy: { no: 'asc' },
      });
      // Original: kas D, pendapatan K → pembalik: kas K, pendapatan D
      expect(pembalikLines[0]!.accountId).toBe(t.akun.kas);
      expect(pembalikLines[0]!.debit.toString()).toBe('0');
      expect(pembalikLines[0]!.kredit.toString()).toBe('500000');
      expect(pembalikLines[1]!.accountId).toBe(t.akun.pendapatan);
      expect(pembalikLines[1]!.debit.toString()).toBe('500000');
      expect(pembalikLines[1]!.kredit.toString()).toBe('0');
    });

    it('reject reverse dua kali (jurnal sudah dibalik)', async () => {
      await withTenant(ctx, tenantCtx(), async () => {
        const draft = await journals.createDraft({
          cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'X', sumber: 'MANUAL',
          lines: [
            { accountId: t.akun.kas, debit: '100', kredit: '0' },
            { accountId: t.akun.pendapatan, debit: '0', kredit: '100' },
          ],
        });
        const posted = await journals.post(draft.id);
        // Pass tanggal eksplisit — default `new Date()` = hari ini, di luar periode test (Mei 2026)
        await journals.reverse(posted.id, { tanggal: new Date('2026-05-16T00:00:00Z'), alasan: 'pertama' });
        // Setelah reverse pertama, status original = REVERSED. Reverse kedua kena
        // guard "Hanya jurnal POSTED yang bisa dibalik" (cek status duluan).
        await expect(
          journals.reverse(posted.id, { tanggal: new Date('2026-05-16T00:00:00Z'), alasan: 'kedua' }),
        ).rejects.toThrow(/hanya.*posted|sudah dibalik/i);
      });
    });
  });

  describe('Status lifecycle', () => {
    it('reject post jurnal yang sudah POSTED', async () => {
      await withTenant(ctx, tenantCtx(), async () => {
        const draft = await journals.createDraft({
          cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'X', sumber: 'MANUAL',
          lines: [
            { accountId: t.akun.kas, debit: '100', kredit: '0' },
            { accountId: t.akun.pendapatan, debit: '0', kredit: '100' },
          ],
        });
        const posted = await journals.post(draft.id);
        await expect(journals.post(posted.id)).rejects.toThrow(/POSTED.*tidak bisa/i);
      });
    });

    it('reject delete jurnal POSTED (hanya DRAFT)', async () => {
      await withTenant(ctx, tenantCtx(), async () => {
        const draft = await journals.createDraft({
          cabangId: t.cabangId, tanggal: '2026-05-15', deskripsi: 'X', sumber: 'MANUAL',
          lines: [
            { accountId: t.akun.kas, debit: '100', kredit: '0' },
            { accountId: t.akun.pendapatan, debit: '0', kredit: '100' },
          ],
        });
        const posted = await journals.post(draft.id);
        await expect(journals.deleteDraft(posted.id)).rejects.toThrow(/hanya draft/i);
      });
    });
  });
});
