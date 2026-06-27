/**
 * Helper untuk integration tests.
 *   - bootApp(): bikin Nest testing module dengan modul yang dibutuhkan
 *   - withTenant(): jalankan callback di dalam AsyncLocalStorage context tenant
 *   - resetDb(): truncate semua tabel data (jaga schema)
 *   - createTestTenant(): bikin tenant baru per test file (isolasi data)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { TenancyModule } from '../src/common/tenancy/tenancy.module.js';
import { SequenceModule } from '../src/common/sequence/sequence.module.js';
import { PeriodsModule } from '../src/modules/periods/periods.module.js';
import { ExcelModule } from '../src/common/excel/excel.module.js';
import { PdfModule } from '../src/common/pdf/pdf.module.js';
import { GlConfigModule } from '../src/common/gl-config/gl-config.module.js';
import { JournalsModule } from '../src/modules/journals/journals.module.js';
import { InventoryModule } from '../src/modules/inventory/inventory.module.js';
import { SalesModule } from '../src/modules/sales/sales.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext, TenantCtx } from '../src/common/tenancy/tenant-context.js';
import {
  AccountKind,
  CostMethod,
  FiscalYearStatus,
  KlasifikasiPpn,
  NormalBalance,
  PeriodStatus,
  PrismaClient,
  Role,
} from '@lentera/db';
import { randomUUID } from 'node:crypto';

/**
 * Superuser Prisma client — untuk setup/teardown (TRUNCATE, seed).
 * App `PrismaService` pakai user `lentera_app` (RLS-enforced, no TRUNCATE).
 */
export const superPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL
        ?? 'postgresql://lentera:lentera_dev_pwd@localhost:5432/lentera_test?schema=public',
    },
  },
  log: ['error'],
});

/** Bootstrap NestJS module dengan modul minimum untuk GL tests. */
export async function bootApp(extraModules: any[] = []): Promise<TestingModule> {
  const mod = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule,
      TenancyModule,
      SequenceModule,
      ExcelModule,
      PdfModule,
      GlConfigModule,
      PeriodsModule,
      JournalsModule,
      ...extraModules,
    ],
  }).compile();
  await mod.init();
  return mod;
}

/** Bootstrap NestJS module dengan Sales + Inventory (untuk sales auto-post tests). */
export async function bootAppWithSales(): Promise<TestingModule> {
  return bootApp([InventoryModule, SalesModule]);
}

/** Run callback inside ALS tenant context. */
export function withTenant<T>(
  ctx: TenantContext,
  tenantCtx: TenantCtx,
  fn: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    ctx.run(tenantCtx, () => {
      fn().then(resolve, reject);
    });
  });
}

/** Truncate semua tabel data — jaga schema. Run sebagai superuser. */
export async function resetDb(_prisma: PrismaService): Promise<void> {
  const prisma = superPrisma; // override — TRUNCATE butuh superuser
  // Order: child tables dulu (FK constraint)
  const tables = [
    'bukti_potong', 'payroll_lines', 'payroll_runs',
    'depresiasi_lines', 'depresiasi_runs', 'aset_tetap',
    'stok_lot_konsumsi', 'stok_lots', 'stok_movements',
    'stok_adjustment_lines', 'stok_adjustments',
    'cash_bank_entry_lines', 'cash_bank_entries',
    'purchase_invoice_lines', 'purchase_invoices',
    'sales_invoice_lines', 'sales_invoices',
    'journal_lines', 'journals', 'sequences',
    'item_stok_awal', 'items', 'vendors', 'customers',
    'tax_rates', 'fiscal_periods', 'fiscal_years',
    'membership_cabang', 'memberships', 'cabang',
    'karyawan', 'accounts', 'tenants',
    'refresh_tokens', 'users', 'audit_logs',
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

interface MinimalTenant {
  tenantId: string;
  userId: string;
  cabangId: string;
  periodId: string;
  fiscalYearId: string;
  /** Akun-akun penting siap pakai. */
  akun: {
    kas: string;
    bank: string;
    piutang: string;
    persediaan: string;
    utangUsaha: string;
    modal: string;
    pendapatan: string;
    hpp: string;
    bebanGaji: string;
  };
}

/**
 * Bikin tenant minimal + cabang + user + COA esensial + 1 tahun buku +
 * 12 periode (Mei OPEN, lainnya OPEN juga supaya test bisa post bebas).
 *
 * Return ID-ID untuk dipakai test.
 */
export async function createTestTenant(_prisma: PrismaService): Promise<MinimalTenant> {
  const prisma = superPrisma; // seed pakai superuser (bypass RLS)
  const tenant = await prisma.tenant.create({
    data: {
      nama: `Test Tenant ${randomUUID().slice(0, 8)}`,
      npwp: '012345678901000',
      isPkp: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `test-${randomUUID().slice(0, 8)}@lentera.id`,
      passwordHash: 'dummy',
      nama: 'Test User',
    },
  });
  await prisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, role: Role.OWNER },
  });
  const cabang = await prisma.cabang.create({
    data: { tenantId: tenant.id, kode: 'TEST', nama: 'Cabang Test', isPusat: true },
  });

  // Tahun buku 2026
  const fy = await prisma.fiscalYear.create({
    data: {
      tenantId: tenant.id,
      kode: '2026',
      startDate: new Date(Date.UTC(2026, 0, 1)),
      endDate: new Date(Date.UTC(2026, 11, 31)),
      status: FiscalYearStatus.OPEN,
    },
  });
  // Bikin periode Mei (target test) + Juni (covers `new Date()` di sales.cancel reversal).
  const period = await prisma.fiscalPeriod.create({
    data: {
      tenantId: tenant.id,
      fiscalYearId: fy.id,
      no: 5,
      label: 'Mei 2026',
      startDate: new Date(Date.UTC(2026, 4, 1)),
      endDate: new Date(Date.UTC(2026, 4, 31)),
      status: PeriodStatus.OPEN,
    },
  });
  await prisma.fiscalPeriod.create({
    data: {
      tenantId: tenant.id,
      fiscalYearId: fy.id,
      no: 6,
      label: 'Juni 2026',
      startDate: new Date(Date.UTC(2026, 5, 1)),
      endDate: new Date(Date.UTC(2026, 5, 30)),
      status: PeriodStatus.OPEN,
    },
  });

  // Akun esensial — minimum untuk test GL & sales
  const mkAkun = (kode: string, nama: string, kind: AccountKind, normal: NormalBalance) =>
    prisma.account.create({
      data: {
        tenantId: tenant.id, kode, nama, kind, normalBalance: normal,
        isPostable: true,
      },
    });
  const [kas, bank, piutang, persediaan, utangUsaha, modal, pendapatan, hpp, bebanGaji, utangPpn, ppnMasukan] = await Promise.all([
    mkAkun('1-101', 'Kas', AccountKind.ASET, NormalBalance.DEBIT),
    mkAkun('1-1021', 'Bank BCA', AccountKind.ASET, NormalBalance.DEBIT),
    mkAkun('1-103', 'Piutang Usaha', AccountKind.ASET, NormalBalance.DEBIT),
    mkAkun('1-104', 'Persediaan', AccountKind.ASET, NormalBalance.DEBIT),
    mkAkun('2-101', 'Utang Usaha', AccountKind.LIABILITAS, NormalBalance.KREDIT),
    mkAkun('3-101', 'Modal Disetor', AccountKind.EKUITAS, NormalBalance.KREDIT),
    mkAkun('4-101', 'Penjualan Barang', AccountKind.PENDAPATAN, NormalBalance.KREDIT),
    mkAkun('5-101', 'HPP', AccountKind.BEBAN_POKOK, NormalBalance.DEBIT),
    mkAkun('6-101', 'Beban Gaji', AccountKind.BEBAN, NormalBalance.DEBIT),
    mkAkun('2-1021', 'Utang PPN Keluaran', AccountKind.LIABILITAS, NormalBalance.KREDIT),
    mkAkun('1-105', 'PPN Masukan', AccountKind.ASET, NormalBalance.DEBIT),
  ]);

  await prisma.taxRate.create({
    data: {
      tenantId: tenant.id, kode: 'PPN-EFEKTIF-11',
      nama: 'PPN 11% efektif',
      tarif: '12',
      ppnSkema: 'EFEKTIF_11',
      akunUtangId: utangPpn.id, akunPiutangId: ppnMasukan.id,
    },
  });

  return {
    tenantId: tenant.id,
    userId: user.id,
    cabangId: cabang.id,
    periodId: period.id,
    fiscalYearId: fy.id,
    akun: {
      kas: kas.id, bank: bank.id, piutang: piutang.id,
      persediaan: persediaan.id, utangUsaha: utangUsaha.id,
      modal: modal.id, pendapatan: pendapatan.id, hpp: hpp.id,
      bebanGaji: bebanGaji.id,
    },
  };
}

/** Bikin item barang (BKP) yang siap dipakai sales/inventory. */
export async function createTestItem(
  tenantId: string,
  akun: { pendapatan: string; persediaan: string; hpp: string },
  opts: { kode?: string; nama?: string; hargaJual?: string; klasifikasiPpn?: KlasifikasiPpn; isJasa?: boolean } = {},
) {
  return superPrisma.item.create({
    data: {
      tenantId,
      kode: opts.kode ?? `BRG-${randomUUID().slice(0, 6)}`,
      nama: opts.nama ?? 'Barang Test',
      satuan: 'Pcs',
      hargaJualDefault: opts.hargaJual ?? '10000',
      klasifikasiPpn: opts.klasifikasiPpn ?? KlasifikasiPpn.BKP,
      isJasa: opts.isJasa ?? false,
      akunPendapatanId: akun.pendapatan,
      akunPersediaanId: akun.persediaan,
      akunHppId: akun.hpp,
    },
  });
}

/** Bikin customer minimal — PKP/non-PKP, default kredit 14 hari. */
export async function createTestCustomer(
  tenantId: string,
  akunPiutangId: string,
  opts: { kode?: string; nama?: string; isPkp?: boolean } = {},
) {
  return superPrisma.customer.create({
    data: {
      tenantId,
      kode: opts.kode ?? `CUST-${randomUUID().slice(0, 6)}`,
      nama: opts.nama ?? 'Pelanggan Test',
      isPkp: opts.isPkp ?? true,
      terminHari: 14,
      kreditLimit: '1000000000',
      akunPiutangId,
    },
  });
}

/** Set costMethod tenant (FIFO atau AVERAGE) — wajib sebelum ada movement. */
export async function setCostMethod(tenantId: string, method: CostMethod): Promise<void> {
  await superPrisma.tenant.update({
    where: { id: tenantId },
    data: { costMethod: method },
  });
}

/**
 * Seed stok awal lewat InventoryService (lewat tenancy.run supaya RLS aktif).
 * Pakai ini supaya `StokLot` ikut ke-create kalau costMethod FIFO.
 */
export async function seedOpeningStock(
  ctx: TenantContext,
  inventoryService: {
    recordInbound: (
      tx: any,
      p: { itemId: string; cabangId: string; tanggal: Date; qty: any; hargaPokok: any; tipe: any; sumberType?: string },
    ) => Promise<string>;
  },
  tenancy: { run: (fn: (tx: any) => Promise<any>) => Promise<any> },
  tenantCtx: TenantCtx,
  opening: { itemId: string; cabangId: string; qty: string; hargaPokok: string; tanggal?: Date },
): Promise<void> {
  const { Decimal } = await import('decimal.js');
  await withTenant(ctx, tenantCtx, () =>
    tenancy.run((tx) =>
      inventoryService.recordInbound(tx, {
        itemId: opening.itemId,
        cabangId: opening.cabangId,
        tanggal: opening.tanggal ?? new Date(Date.UTC(2026, 3, 30)), // 30 Apr 2026 — sebelum periode
        qty: new Decimal(opening.qty),
        hargaPokok: new Decimal(opening.hargaPokok),
        tipe: 'STOK_AWAL' as any,
      }),
    ),
  );
}
