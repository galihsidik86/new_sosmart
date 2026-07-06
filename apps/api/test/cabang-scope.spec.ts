/**
 * Regresi untuk bug IDOR lintas-cabang: sebelum perbaikan,
 * `CabangScopeService.assertAccess()` hanya dipanggil di `byId`/`createDraft`,
 * TIDAK di `updateDraft`/`post`/`cancel`/`deleteDraft`. User dengan
 * `MembershipCabang` terbatas ke cabang A bisa memutasi (edit/post/batal/
 * hapus) dokumen cabang B selama tenant-nya sama — RLS lolos karena
 * tenant_id cocok, tapi cabang tidak pernah dicek.
 *
 * Test ini membuat 2 cabang dalam 1 tenant, bikin dokumen DRAFT di cabang B
 * pakai user full-access, lalu coba mutasi dokumen itu pakai user yang
 * di-restrict hanya ke cabang A — harus ForbiddenException di SEMUA method
 * mutasi, bukan cuma create/byId.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { SalesService } from '../src/modules/sales/sales.service.js';
import { JournalsService } from '../src/modules/journals/journals.service.js';
import {
  bootAppWithSales,
  createTestCustomer,
  createTestItem,
  createTestTenant,
  resetDb,
  superPrisma,
  withTenant,
} from './helpers.js';
import { KlasifikasiPpn } from '@lentera/db';

describe('CabangScope — isolasi mutasi lintas-cabang (IDOR)', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let sales: SalesService;
  let journals: JournalsService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;
  let cabangBId: string;
  let customerId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await bootAppWithSales();
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    sales = app.get(SalesService);
    journals = app.get(JournalsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    t = await createTestTenant(prisma);
    const cabangB = await superPrisma.cabang.create({
      data: { tenantId: t.tenantId, kode: 'CAB-B', nama: 'Cabang B', isPusat: false },
    });
    cabangBId = cabangB.id;
    const cust = await createTestCustomer(t.tenantId, t.akun.piutang);
    customerId = cust.id;
    const item = await createTestItem(t.tenantId, t.akun, { kode: 'BRG-CS', nama: 'Barang' });
    itemId = item.id;
  });

  /** Full access (OWNER, semua cabang) — dipakai untuk setup data. */
  function fullAccessCtx() {
    return { tenantId: t.tenantId, userId: t.userId, role: 'OWNER', cabangIds: null };
  }

  /** Restricted ke cabang A (t.cabangId) SAJA — cabang B tidak boleh diakses. */
  function restrictedToCabangACtx() {
    return { tenantId: t.tenantId, userId: t.userId, role: 'AKUNTAN', cabangIds: [t.cabangId] };
  }

  function salesLine() {
    return {
      itemId,
      deskripsi: 'Barang',
      qty: '1',
      satuan: 'Pcs',
      hargaSatuan: '10000',
      diskonPersen: '0',
      klasifikasiPpn: KlasifikasiPpn.NON_BKP,
      isJasa: false,
      akunPendapatanId: t.akun.pendapatan,
    };
  }

  function salesInvoiceInput(overrides: { tanggal?: string } = {}) {
    return {
      cabangId: cabangBId,
      customerId,
      tanggal: overrides.tanggal ?? '2026-05-15',
      termin: 'KREDIT' as const,
      akunArId: t.akun.piutang,
      tarifPpnPersen: 11,
      hargaTermasukPajak: false,
      lines: [salesLine()],
    };
  }

  describe('SalesService — draft milik cabang B', () => {
    async function createDraftInCabangB() {
      return withTenant(ctx, fullAccessCtx(), () => sales.createDraft(salesInvoiceInput()));
    }

    it('updateDraft ditolak untuk user restricted ke cabang A', async () => {
      const draft = await createDraftInCabangB();
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () =>
          sales.updateDraft(draft.id, salesInvoiceInput({ tanggal: '2026-05-16' })),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('post ditolak untuk user restricted ke cabang A', async () => {
      const draft = await createDraftInCabangB();
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => sales.post(draft.id)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cancel ditolak untuk user restricted ke cabang A', async () => {
      const draft = await createDraftInCabangB();
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => sales.cancel(draft.id, 'test')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deleteDraft ditolak untuk user restricted ke cabang A', async () => {
      const draft = await createDraftInCabangB();
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => sales.deleteDraft(draft.id)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('user full-access (cabangIds=null) tetap bisa mutasi dokumen cabang B', async () => {
      const draft = await createDraftInCabangB();
      await expect(
        withTenant(ctx, fullAccessCtx(), () => sales.deleteDraft(draft.id)),
      ).resolves.not.toThrow();
    });
  });

  describe('JournalsService — jurnal manual milik cabang B', () => {
    async function createJournalInCabangB() {
      return withTenant(ctx, fullAccessCtx(), () =>
        journals.createDraft({
          cabangId: cabangBId,
          tanggal: '2026-05-15',
          deskripsi: 'Test jurnal cabang B',
          sumber: 'MANUAL',
          lines: [
            { accountId: t.akun.kas, debit: '10000', kredit: '0' },
            { accountId: t.akun.modal, debit: '0', kredit: '10000' },
          ],
        }),
      );
    }

    it('post ditolak untuk user restricted ke cabang A', async () => {
      const j = await createJournalInCabangB();
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => journals.post(j.id)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updateDraft ditolak untuk user restricted ke cabang A', async () => {
      const j = await createJournalInCabangB();
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () =>
          journals.updateDraft(j.id, {
            cabangId: cabangBId,
            tanggal: '2026-05-15',
            deskripsi: 'Edit',
            sumber: 'MANUAL',
            lines: [
              { accountId: t.akun.kas, debit: '5000', kredit: '0' },
              { accountId: t.akun.modal, debit: '0', kredit: '5000' },
            ],
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deleteDraft ditolak untuk user restricted ke cabang A', async () => {
      const j = await createJournalInCabangB();
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => journals.deleteDraft(j.id)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('reverse (via post lalu reverse) ditolak untuk user restricted ke cabang A', async () => {
      const j = await createJournalInCabangB();
      await withTenant(ctx, fullAccessCtx(), () => journals.post(j.id));
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () =>
          journals.reverse(j.id, { alasan: 'test pembalik' }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
