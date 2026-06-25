/**
 * Re-export Prisma client + enums + model types.
 *
 * Konvensi:
 *   - Enum di-export sebagai VALUE (Prisma generate enum sebagai `const` object,
 *     bukan TS enum). Dipakai di service untuk perbandingan `===` dan default
 *     parameters.
 *   - Model types di-export sebagai type-only (interface).
 */

export { PrismaClient, Prisma } from '@prisma/client';

// Enum values
export {
  Role,
  AccountKind,
  NormalBalance,
  PpnSkema,
  KlasifikasiPpn,
  TipeCustomer,
  PeriodStatus,
  FiscalYearStatus,
  JournalStatus,
  JournalSource,
  InvoiceStatus,
  TerminPembayaran,
  KodeFakturPajak,
  CashBankType,
  CostMethod,
  StokMovementType,
  AsetStatus,
  KelompokAsetTetap,
  MetodePenyusutan,
  PtkpStatus,
  PtkpKategori,
  JenisKaryawan,
  BuktiPotongStatus,
  JenisPph,
  AuditAction,
} from '@prisma/client';

// Model types (interface) — type-only
export type {
  User,
  Tenant,
  Cabang,
  Membership,
  RefreshToken,
  Account,
  TaxRate,
  Item,
  ItemStokAwal,
  Vendor,
  Customer,
  FiscalYear,
  FiscalPeriod,
  Journal,
  JournalLine,
  Sequence,
  SalesInvoice,
  SalesInvoiceLine,
  PurchaseInvoice,
  PurchaseInvoiceLine,
  CashBankEntry,
  CashBankEntryLine,
  StokMovement,
  StokLot,
  StokLotKonsumsi,
  StokAdjustment,
  StokAdjustmentLine,
  AsetTetap,
  DepresiasiRun,
  DepresiasiLine,
  Karyawan,
  PayrollRun,
  PayrollLine,
  BuktiPotong,
  AuditLog,
} from '@prisma/client';
