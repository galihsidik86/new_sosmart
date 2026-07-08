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
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { SalesService } from '../src/modules/sales/sales.service.js';
import { JournalsService } from '../src/modules/journals/journals.service.js';
import { OpeningBalanceService } from '../src/modules/opening-balance/opening-balance.service.js';
import { OpeningBalanceModule } from '../src/modules/opening-balance/opening-balance.module.js';
import { PurchasesService } from '../src/modules/purchases/purchases.service.js';
import { PurchasesModule } from '../src/modules/purchases/purchases.module.js';
import { BuktiPotongModule } from '../src/modules/bukti-potong/bukti-potong.module.js';
import { BuktiPotongService } from '../src/modules/bukti-potong/bukti-potong.service.js';
import { CashBankService } from '../src/modules/cashbank/cashbank.service.js';
import { CashBankModule } from '../src/modules/cashbank/cashbank.module.js';
import { AdjustmentsService } from '../src/modules/adjustments/adjustments.service.js';
import { AdjustmentsModule } from '../src/modules/adjustments/adjustments.module.js';
import { AsetService } from '../src/modules/aset/aset.service.js';
import { AsetModule } from '../src/modules/aset/aset.module.js';
import { PayrollModule } from '../src/modules/payroll/payroll.module.js';
import { KaryawanService } from '../src/modules/payroll/karyawan.service.js';
import { UsersModule } from '../src/modules/users/users.module.js';
import { UsersService } from '../src/modules/users/users.service.js';
import {
  bootAppWithSales,
  createTestCustomer,
  createTestItem,
  createTestTenant,
  resetDb,
  superPrisma,
  withTenant,
} from './helpers.js';
import {
  AccountKind,
  CashBankType,
  JenisKaryawan,
  KelompokAsetTetap,
  KlasifikasiPpn,
  MetodePenyusutan,
  NormalBalance,
  PtkpStatus,
  Role,
} from '@lentera/db';
import type { CreateKaryawanInput } from '@lentera/shared/schemas';

describe('CabangScope — isolasi mutasi lintas-cabang (IDOR)', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let sales: SalesService;
  let journals: JournalsService;
  let ob: OpeningBalanceService;
  let purchases: PurchasesService;
  let buktiPotong: BuktiPotongService;
  let cashbank: CashBankService;
  let adjustments: AdjustmentsService;
  let aset: AsetService;
  let karyawan: KaryawanService;
  let users: UsersService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;
  let cabangBId: string;
  let customerId: string;
  let vendorId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await bootAppWithSales([
      OpeningBalanceModule,
      PurchasesModule,
      BuktiPotongModule,
      CashBankModule,
      AdjustmentsModule,
      AsetModule,
      PayrollModule,
      UsersModule,
    ]);
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    sales = app.get(SalesService);
    journals = app.get(JournalsService);
    ob = app.get(OpeningBalanceService);
    purchases = app.get(PurchasesService);
    buktiPotong = app.get(BuktiPotongService);
    cashbank = app.get(CashBankService);
    adjustments = app.get(AdjustmentsService);
    aset = app.get(AsetService);
    karyawan = app.get(KaryawanService);
    users = app.get(UsersService);
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
    const vendor = await superPrisma.vendor.create({
      data: {
        tenantId: t.tenantId, kode: 'VEND-CS', nama: 'Vendor Cabang Scope',
        isPkp: true, terminHari: 30, akunUtangId: t.akun.utangUsaha,
      },
    });
    vendorId = vendor.id;
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

  // Beda kelas bug dari 2 describe di atas: yang di atas menguji role
  // RESTRICTED (assertAccess menolak dengan benar). Di bawah ini menguji
  // role FULL-ACCESS (OWNER) — assertAccess() SENDIRIAN adalah no-op untuk
  // role ini, jadi cabangId dari TENANT LAIN (bukan cuma cabang lain dalam
  // tenant yang sama) bisa lolos FK constraint (tidak kena RLS di INSERT)
  // kalau tidak ada verifikasi tambahan. CabangScopeService.assertOwnedByTenant
  // menutup celah ini.
  describe('cabangId lintas-TENANT ditolak untuk full-access user', () => {
    it('SalesService.createDraft menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          sales.createDraft({ ...salesInvoiceInput(), cabangId: otherTenant.cabangId }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('OpeningBalanceService.addPiutang menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          ob.addPiutang({
            customerId, cabangId: otherTenant.cabangId, tanggal: '2026-05-15', nominal: '1000000',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ------------------------------------------------------------------
  // R7 (EVALUASI.md) — tutup gap coverage: modul di bawah ini sudah punya
  // fix cabang-scope dari ronde 3, tapi belum ada test IDOR eksplisit.
  // ------------------------------------------------------------------

  function purchaseLine() {
    return {
      itemId,
      deskripsi: 'Barang',
      qty: '1',
      satuan: 'Pcs',
      hargaSatuan: '10000',
      diskonPersen: '0',
      klasifikasiPpn: KlasifikasiPpn.NON_BKP,
      isJasa: false,
      akunDebitId: t.akun.persediaan,
    };
  }

  function purchaseInvoiceInput(overrides: { cabangId?: string; tanggal?: string } = {}) {
    return {
      cabangId: overrides.cabangId ?? cabangBId,
      vendorId,
      tanggal: overrides.tanggal ?? '2026-05-15',
      termin: 'KREDIT' as const,
      akunApId: t.akun.utangUsaha,
      tarifPpnPersen: 11,
      tarifPph23Persen: 2,
      potongPph23: false,
      hargaTermasukPajak: false,
      lines: [purchaseLine()],
    };
  }

  describe('PurchasesService — draft milik cabang B', () => {
    it('post ditolak untuk user restricted ke cabang A', async () => {
      const draft = await withTenant(ctx, fullAccessCtx(), () =>
        purchases.createDraft(purchaseInvoiceInput()),
      );
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => purchases.post(draft.id)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('createDraft menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          purchases.createDraft(purchaseInvoiceInput({ cabangId: otherTenant.cabangId })),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  function cashBankInput(overrides: { cabangId?: string; tanggal?: string } = {}) {
    return {
      cabangId: overrides.cabangId ?? cabangBId,
      tipe: CashBankType.RECEIPT,
      tanggal: overrides.tanggal ?? '2026-05-15',
      akunKasBankId: t.akun.kas,
      total: '50000',
      kontak: 'Test',
      deskripsi: 'Kas masuk test',
      lines: [{ accountId: t.akun.modal, nilai: '50000' }],
    };
  }

  describe('CashBankService — entry milik cabang B', () => {
    it('post ditolak untuk user restricted ke cabang A', async () => {
      const draft = await withTenant(ctx, fullAccessCtx(), () =>
        cashbank.createDraft(cashBankInput()),
      );
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => cashbank.post(draft.id)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('createDraft menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          cashbank.createDraft(cashBankInput({ cabangId: otherTenant.cabangId })),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  function adjustmentInput(overrides: { cabangId?: string; tanggal?: string } = {}) {
    return {
      cabangId: overrides.cabangId ?? cabangBId,
      tanggal: overrides.tanggal ?? '2026-05-15',
      alasan: 'Opname rutin cabang scope test',
      // qtyFisik '0' = tidak butuh seed stok — item baru saldo-nya 0, delta 0.
      lines: [{ itemId, qtyFisik: '0' }],
    };
  }

  describe('AdjustmentsService — draft milik cabang B', () => {
    it('post ditolak untuk user restricted ke cabang A', async () => {
      const draft = await withTenant(ctx, fullAccessCtx(), () =>
        adjustments.createDraft(adjustmentInput()),
      );
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => adjustments.post(draft.id)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('createDraft menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          adjustments.createDraft(adjustmentInput({ cabangId: otherTenant.cabangId })),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  async function asetInput(cabangId: string) {
    const [akunAset, akunAkum, akunBeban] = await Promise.all([
      superPrisma.account.create({
        data: {
          tenantId: t.tenantId, kode: `1-${Math.random().toString(36).slice(2, 6)}`,
          nama: 'Aset CS', kind: AccountKind.ASET, normalBalance: NormalBalance.DEBIT, isPostable: true,
        },
      }),
      superPrisma.account.create({
        data: {
          tenantId: t.tenantId, kode: `1-${Math.random().toString(36).slice(2, 6)}`,
          nama: 'Akum CS', kind: AccountKind.ASET, normalBalance: NormalBalance.KREDIT, isPostable: true,
        },
      }),
      superPrisma.account.create({
        data: {
          tenantId: t.tenantId, kode: `6-${Math.random().toString(36).slice(2, 6)}`,
          nama: 'Beban CS', kind: AccountKind.BEBAN, normalBalance: NormalBalance.DEBIT, isPostable: true,
        },
      }),
    ]);
    return {
      cabangId,
      kode: `AST-${Math.random().toString(36).slice(2, 8)}`,
      nama: 'Aset Cabang Scope',
      kelompok: KelompokAsetTetap.KELOMPOK_I,
      metode: MetodePenyusutan.GARIS_LURUS,
      tanggalPerolehan: '2026-01-01',
      hargaPerolehan: '10000000',
      nilaiResidu: '0',
      akumulasiPenyusutan: '0',
      akunAsetId: akunAset.id,
      akunAkumulasiId: akunAkum.id,
      akunBebanId: akunBeban.id,
    };
  }

  describe('AsetService — create', () => {
    it('ditolak untuk user restricted ke cabang A', async () => {
      const input = await asetInput(cabangBId);
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () => aset.create(input)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      const input = await asetInput(otherTenant.cabangId);
      await expect(
        withTenant(ctx, fullAccessCtx(), () => aset.create(input)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  function buktiPotongInput(cabangId: string) {
    return {
      cabangId,
      jenisPph: 'PPH_23' as const,
      tanggal: '2026-05-15',
      pihakNama: 'Pihak Test',
      pihakNpwp: '123456789012345',
      dpp: '1000000',
      tarifPersen: 2,
      pph: '20000',
    };
  }

  describe('BuktiPotongService — createManual', () => {
    it('ditolak untuk user restricted ke cabang A', async () => {
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () =>
          buktiPotong.createManual(buktiPotongInput(cabangBId)),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          buktiPotong.createManual(buktiPotongInput(otherTenant.cabangId)),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // OpeningBalanceService.addPiutang/addUtang/setPersediaan semua lewat
  // assertOwnedByTenant (bukan assertAccess biasa) — otomatis defends
  // restricted-cabang-A DAN cross-tenant sekaligus. addPiutang cross-tenant
  // sudah dites di describe block "cabangId lintas-TENANT" di atas; sisanya
  // (restricted-cabang-A utk ketiganya + cross-tenant utk addUtang/setPersediaan)
  // belum ada — ditutup di sini.
  describe('OpeningBalanceService — restricted-cabang-A & cross-tenant tambahan', () => {
    it('addPiutang ditolak untuk user restricted ke cabang A', async () => {
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () =>
          ob.addPiutang({ customerId, cabangId: cabangBId, tanggal: '2026-05-15', nominal: '1000000' }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('addUtang ditolak untuk user restricted ke cabang A', async () => {
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () =>
          ob.addUtang({ vendorId, cabangId: cabangBId, tanggal: '2026-05-15', nominal: '1000000' }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('setPersediaan ditolak untuk user restricted ke cabang A', async () => {
      await expect(
        withTenant(ctx, restrictedToCabangACtx(), () =>
          ob.setPersediaan({
            lines: [{ itemId, cabangId: cabangBId, tanggal: '2026-05-15', qty: '1', hargaPokokPerUnit: '1000' }],
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('addUtang menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          ob.addUtang({ vendorId, cabangId: otherTenant.cabangId, tanggal: '2026-05-15', nominal: '1000000' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('setPersediaan menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          ob.setPersediaan({
            lines: [{ itemId, cabangId: otherTenant.cabangId, tanggal: '2026-05-15', qty: '1', hargaPokokPerUnit: '1000' }],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  function karyawanInput(cabangId: string | null): CreateKaryawanInput {
    return {
      cabangId,
      kode: `KAR-${Math.random().toString(36).slice(2, 8)}`,
      nik: '1234567890123456',
      nama: 'Karyawan Cabang Scope',
      npwp: null,
      ptkpStatus: PtkpStatus.TK_0,
      jenisKaryawan: JenisKaryawan.PEGAWAI_TETAP,
      tanggalMasuk: '2026-01-01',
      gajiPokok: '5000000',
      tunjanganTetap: '0',
      iuranBpjsKaryawan: '0',
    };
  }

  // KaryawanService HANYA panggil assertOwnedByTenant kalau cabangId di-set
  // (field opsional) — tidak ada jalur restricted-cabang-A yang relevan
  // (lihat komentar di karyawan.service.ts), jadi fokus ke cross-tenant.
  describe('KaryawanService — cabangId lintas-tenant', () => {
    it('create menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () => karyawan.create(karyawanInput(otherTenant.cabangId))),
      ).rejects.toThrow(BadRequestException);
    });

    it('update menolak cabangId milik tenant lain', async () => {
      const created = await withTenant(ctx, fullAccessCtx(), () =>
        karyawan.create(karyawanInput(t.cabangId)),
      );
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          karyawan.update(created.id, { cabangId: otherTenant.cabangId }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // UsersService punya struktur beda dari 15 titik lain: assertCanManage()
  // (role-based, dites cukup lewat restricted AKUNTAN yang sudah dites tidak
  // relevan di sini — targetnya beda konsep) + assertCabangIdsOwnedByTenant()
  // (tenant-ownership, kelas bug yang sama dgn seluruh modul di atas).
  describe('UsersService — cabangId lintas-tenant', () => {
    it('create menolak cabangId milik tenant lain', async () => {
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          users.create({
            email: `user-cs-${Math.random().toString(36).slice(2, 8)}@test.lentera.id`,
            nama: 'User Cabang Scope',
            password: 'password123',
            role: Role.ADMIN,
            cabangIds: [otherTenant.cabangId],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('update menolak cabangId milik tenant lain', async () => {
      const created = await withTenant(ctx, fullAccessCtx(), () =>
        users.create({
          email: `user-cs-upd-${Math.random().toString(36).slice(2, 8)}@test.lentera.id`,
          nama: 'User Cabang Scope Update',
          password: 'password123',
          role: Role.ADMIN,
          cabangIds: [t.cabangId],
        }),
      );
      const otherTenant = await createTestTenant(prisma);
      await expect(
        withTenant(ctx, fullAccessCtx(), () =>
          users.update(created.userId, { cabangIds: [otherTenant.cabangId] }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
