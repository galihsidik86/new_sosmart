-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('ASET', 'LIABILITAS', 'EKUITAS', 'PENDAPATAN', 'BEBAN_POKOK', 'BEBAN', 'PENDAPATAN_LAIN', 'BEBAN_LAIN');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'KREDIT');

-- CreateEnum
CREATE TYPE "PpnSkema" AS ENUM ('EFEKTIF_11', 'EFEKTIF_12', 'KHUSUS', 'BEBAS', 'TIDAK_DIPUNGUT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'POST', 'UNPOST', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "KlasifikasiPpn" AS ENUM ('BKP', 'JKP', 'NON_BKP', 'BKP_STRATEGIS', 'BEBAS_PPN');

-- CreateEnum
CREATE TYPE "TipeCustomer" AS ENUM ('DISTRIBUTOR', 'RITEL', 'KORPORAT', 'KOPERASI', 'PEMERINTAH', 'LAINNYA');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED');

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('MANUAL', 'PENJUALAN', 'RETUR_JUAL', 'PEMBELIAN', 'RETUR_BELI', 'KAS_BANK', 'PENYUSUTAN', 'PENYESUAIAN', 'TUTUP_BUKU', 'PAJAK');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TerminPembayaran" AS ENUM ('TUNAI', 'KREDIT');

-- CreateEnum
CREATE TYPE "KodeFakturPajak" AS ENUM ('K010', 'K020', 'K030', 'K040', 'K050', 'K060', 'K070', 'K080', 'K090');

-- CreateEnum
CREATE TYPE "CashBankType" AS ENUM ('RECEIPT', 'PAYMENT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "CostMethod" AS ENUM ('FIFO', 'AVERAGE');

-- CreateEnum
CREATE TYPE "PtkpStatus" AS ENUM ('TK_0', 'TK_1', 'TK_2', 'TK_3', 'K_0', 'K_1', 'K_2', 'K_3', 'HB_0', 'HB_1', 'HB_2', 'HB_3');

-- CreateEnum
CREATE TYPE "PtkpKategori" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "JenisKaryawan" AS ENUM ('PEGAWAI_TETAP', 'PEGAWAI_TIDAK_TETAP', 'BUKAN_PEGAWAI', 'PENERIMA_PENSIUN');

-- CreateEnum
CREATE TYPE "BuktiPotongStatus" AS ENUM ('DRAFT', 'TERBIT', 'DIKIRIM_DJP', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "JenisPph" AS ENUM ('PPH_21', 'PPH_22', 'PPH_23', 'PPH_25', 'PPH_26', 'PPH_29', 'PPH_4_AYAT_2', 'PPH_15');

-- CreateEnum
CREATE TYPE "AsetStatus" AS ENUM ('AKTIF', 'DIJUAL', 'RUSAK', 'PENSIUN');

-- CreateEnum
CREATE TYPE "KelompokAsetTetap" AS ENUM ('BANGUNAN_PERMANEN', 'BANGUNAN_NON_PERMANEN', 'KELOMPOK_I', 'KELOMPOK_II', 'KELOMPOK_III', 'KELOMPOK_IV');

-- CreateEnum
CREATE TYPE "MetodePenyusutan" AS ENUM ('GARIS_LURUS', 'SALDO_MENURUN');

-- CreateEnum
CREATE TYPE "StokMovementType" AS ENUM ('STOK_AWAL', 'PEMBELIAN', 'RETUR_BELI', 'PENJUALAN', 'RETUR_JUAL', 'OPNAME_PLUS', 'OPNAME_MINUS', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_address" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nama" TEXT NOT NULL,
    "npwp" TEXT,
    "is_pkp" BOOLEAN NOT NULL DEFAULT false,
    "pkp_no" TEXT,
    "alamat" TEXT,
    "email" TEXT,
    "telp" TEXT,
    "tahun_buku" INTEGER NOT NULL DEFAULT 1,
    "cost_method" "CostMethod" NOT NULL DEFAULT 'AVERAGE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabang" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kode_cabang_npwp" VARCHAR(3),
    "npwp_cabang" TEXT,
    "alamat" TEXT,
    "is_pusat" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cabang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_cabang" (
    "membership_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,

    CONSTRAINT "membership_cabang_pkey" PRIMARY KEY ("membership_id","cabang_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "normal_balance" "NormalBalance" NOT NULL,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "saldo_awal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tarif" DECIMAL(7,4) NOT NULL,
    "ppn_skema" "PpnSkema",
    "akun_utang_id" UUID,
    "akun_piutang_id" UUID,
    "is_aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kategori" TEXT,
    "satuan" TEXT NOT NULL DEFAULT 'Pcs',
    "harga_jual_default" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "klasifikasi_ppn" "KlasifikasiPpn" NOT NULL DEFAULT 'BKP',
    "is_jasa" BOOLEAN NOT NULL DEFAULT false,
    "kode_satuan_djp" TEXT,
    "akun_pendapatan_id" UUID,
    "akun_persediaan_id" UUID,
    "akun_hpp_id" UUID,
    "akun_beban_id" UUID,
    "is_aktif" BOOLEAN NOT NULL DEFAULT true,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_stok_awal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "qty" DECIMAL(20,4) NOT NULL,
    "harga_pokok_per_unit" DECIMAL(20,2) NOT NULL,
    "tanggal" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_stok_awal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "npwp" TEXT,
    "is_pkp" BOOLEAN NOT NULL DEFAULT false,
    "kategori" TEXT,
    "alamat" TEXT,
    "kota" TEXT,
    "provinsi" TEXT,
    "kode_pos" TEXT,
    "telp" TEXT,
    "email" TEXT,
    "contact_person" TEXT,
    "termin_hari" INTEGER NOT NULL DEFAULT 30,
    "akun_utang_id" UUID,
    "is_aktif" BOOLEAN NOT NULL DEFAULT true,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "npwp" TEXT,
    "is_pkp" BOOLEAN NOT NULL DEFAULT false,
    "tipe" "TipeCustomer" NOT NULL DEFAULT 'RITEL',
    "alamat" TEXT,
    "kota" TEXT,
    "provinsi" TEXT,
    "kode_pos" TEXT,
    "telp" TEXT,
    "email" TEXT,
    "contact_person" TEXT,
    "termin_hari" INTEGER NOT NULL DEFAULT 14,
    "kredit_limit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "akun_piutang_id" UUID,
    "is_aktif" BOOLEAN NOT NULL DEFAULT true,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "no" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "catatan_tutup" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "nomor" TEXT,
    "tanggal" DATE NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "sumber" "JournalSource" NOT NULL DEFAULT 'MANUAL',
    "sumber_ref" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "reversed_from_id" UUID,
    "reversed_by_id" UUID,
    "total_debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_kredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "no" INTEGER NOT NULL,
    "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "kredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "deskripsi" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("tenant_id","kode")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "nomor" TEXT,
    "tanggal" DATE NOT NULL,
    "jatuh_tempo" DATE NOT NULL,
    "termin" "TerminPembayaran" NOT NULL DEFAULT 'KREDIT',
    "akun_ar_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "deskripsi" TEXT,
    "kode_faktur_pajak" "KodeFakturPajak",
    "nsfp" TEXT,
    "total_dpp" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_ppn" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_pph23" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_diskon" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_netto" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_dibayar" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "journal_id" UUID,
    "hpp_journal_id" UUID,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "item_id" UUID,
    "no" INTEGER NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "qty" DECIMAL(20,4) NOT NULL,
    "satuan" TEXT NOT NULL,
    "harga_satuan" DECIMAL(20,2) NOT NULL,
    "diskon_persen" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "klasifikasi_ppn" "KlasifikasiPpn" NOT NULL,
    "is_jasa" BOOLEAN NOT NULL DEFAULT false,
    "bruto" DECIMAL(20,2) NOT NULL,
    "diskon_nilai" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "dpp" DECIMAL(20,2) NOT NULL,
    "ppn" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "pph23" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "akun_pendapatan_id" UUID NOT NULL,

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "nomor" TEXT,
    "nomor_vendor" TEXT,
    "tanggal" DATE NOT NULL,
    "jatuh_tempo" DATE NOT NULL,
    "termin" "TerminPembayaran" NOT NULL DEFAULT 'KREDIT',
    "akun_ap_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "deskripsi" TEXT,
    "nsfp_masukan" TEXT,
    "total_dpp" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_ppn" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_pph23" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_diskon" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_netto" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_dibayar" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "journal_id" UUID,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "item_id" UUID,
    "no" INTEGER NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "qty" DECIMAL(20,4) NOT NULL,
    "satuan" TEXT NOT NULL,
    "harga_satuan" DECIMAL(20,2) NOT NULL,
    "diskon_persen" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "klasifikasi_ppn" "KlasifikasiPpn" NOT NULL,
    "is_jasa" BOOLEAN NOT NULL DEFAULT false,
    "bruto" DECIMAL(20,2) NOT NULL,
    "diskon_nilai" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "dpp" DECIMAL(20,2) NOT NULL,
    "ppn" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "pph23" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "akun_debit_id" UUID NOT NULL,

    CONSTRAINT "purchase_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_bank_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "nomor" TEXT,
    "tanggal" DATE NOT NULL,
    "tipe" "CashBankType" NOT NULL,
    "akun_kas_bank_id" UUID NOT NULL,
    "total" DECIMAL(20,2) NOT NULL,
    "akun_kas_bank_lawan_id" UUID,
    "kontak" TEXT,
    "deskripsi" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "sales_invoice_id" UUID,
    "purchase_invoice_id" UUID,
    "journal_id" UUID,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_bank_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_bank_entry_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "no" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "nilai" DECIMAL(20,2) NOT NULL,
    "deskripsi" TEXT,

    CONSTRAINT "cash_bank_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stok_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "tanggal" DATE NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipe" "StokMovementType" NOT NULL,
    "qty_in" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "qty_out" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "harga_pokok" DECIMAL(20,4) NOT NULL,
    "nilai" DECIMAL(20,2) NOT NULL,
    "saldo_qty" DECIMAL(20,4) NOT NULL,
    "saldo_nilai" DECIMAL(20,2) NOT NULL,
    "sumber_type" TEXT,
    "sumber_id" TEXT,
    "keterangan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stok_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stok_lots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "tanggal_masuk" DATE NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qty_masuk" DECIMAL(20,4) NOT NULL,
    "qty_terpakai" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "harga_pokok" DECIMAL(20,4) NOT NULL,
    "movement_masuk_id" UUID NOT NULL,

    CONSTRAINT "stok_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stok_lot_konsumsi" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "movement_out_id" UUID NOT NULL,
    "qty" DECIMAL(20,4) NOT NULL,
    "harga_pokok" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "stok_lot_konsumsi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stok_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "nomor" TEXT,
    "tanggal" DATE NOT NULL,
    "alasan" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "journal_id" UUID,
    "total_delta_nilai" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stok_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stok_adjustment_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "adjustment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "no" INTEGER NOT NULL,
    "qty_saat_ini" DECIMAL(20,4) NOT NULL,
    "qty_fisik" DECIMAL(20,4) NOT NULL,
    "delta" DECIMAL(20,4) NOT NULL,
    "harga_pokok" DECIMAL(20,4) NOT NULL,
    "nilai_delta" DECIMAL(20,2) NOT NULL,
    "keterangan" TEXT,

    CONSTRAINT "stok_adjustment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aset_tetap" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kelompok" "KelompokAsetTetap" NOT NULL,
    "metode" "MetodePenyusutan" NOT NULL DEFAULT 'GARIS_LURUS',
    "tanggal_perolehan" DATE NOT NULL,
    "mulai_penyusutan" DATE NOT NULL,
    "harga_perolehan" DECIMAL(20,2) NOT NULL,
    "nilai_residu" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "masa_manfaat_bulan" INTEGER NOT NULL,
    "akumulasi_penyusutan" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "nilai_buku" DECIMAL(20,2) NOT NULL,
    "last_depresiasi_periode" TEXT,
    "akun_aset_id" UUID NOT NULL,
    "akun_akumulasi_id" UUID NOT NULL,
    "akun_beban_id" UUID NOT NULL,
    "status" "AsetStatus" NOT NULL DEFAULT 'AKTIF',
    "catatan" TEXT,
    "tanggal_dihentikan" DATE,
    "harga_jual_disposal" DECIMAL(20,2),
    "disposal_journal_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aset_tetap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depresiasi_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "periode" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "journal_id" UUID,
    "total_penyusutan" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depresiasi_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depresiasi_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "aset_id" UUID NOT NULL,
    "nilai" DECIMAL(20,2) NOT NULL,
    "nilai_buku_sebelum" DECIMAL(20,2) NOT NULL,
    "nilai_buku_sesudah" DECIMAL(20,2) NOT NULL,
    "akumulasi_sesudah" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "depresiasi_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "karyawan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID,
    "kode" TEXT NOT NULL,
    "nip" TEXT,
    "nik" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "email" TEXT,
    "telp" TEXT,
    "alamat" TEXT,
    "npwp" TEXT,
    "ptkpStatus" "PtkpStatus" NOT NULL,
    "jenis_karyawan" "JenisKaryawan" NOT NULL DEFAULT 'PEGAWAI_TETAP',
    "jabatan" TEXT,
    "tanggal_masuk" DATE NOT NULL,
    "tanggal_keluar" DATE,
    "gaji_pokok" DECIMAL(20,2) NOT NULL,
    "tunjangan_tetap" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "iuran_bpjs_karyawan" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "karyawan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "periode" TEXT NOT NULL,
    "nomor" TEXT,
    "tanggal" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "total_gaji_pokok" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_tunjangan" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_iuran_bpjs" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_pph21" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_take_home" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "akun_kas_bank_id" UUID NOT NULL,
    "journal_id" UUID,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "karyawan_id" UUID NOT NULL,
    "no" INTEGER NOT NULL,
    "nama_snapshot" TEXT NOT NULL,
    "npwp_snapshot" TEXT,
    "ptkp_status_snapshot" "PtkpStatus" NOT NULL,
    "ptkp_kategori" "PtkpKategori" NOT NULL,
    "gaji_pokok" DECIMAL(20,2) NOT NULL,
    "tunjangan" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "bruto" DECIMAL(20,2) NOT NULL,
    "tarif_ter_persen" DECIMAL(7,4) NOT NULL,
    "pph21" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "iuran_bpjs" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "potongan_lain" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "take_home" DECIMAL(20,2) NOT NULL,
    "catatan" TEXT,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bukti_potong" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "jenis_pph" "JenisPph" NOT NULL,
    "nomor" TEXT,
    "tanggal" DATE NOT NULL,
    "status" "BuktiPotongStatus" NOT NULL DEFAULT 'DRAFT',
    "pihak_nama" TEXT NOT NULL,
    "pihak_npwp" TEXT,
    "pihak_nik" TEXT,
    "pihak_alamat" TEXT,
    "dpp" DECIMAL(20,2) NOT NULL,
    "tarif_persen" DECIMAL(7,4) NOT NULL,
    "pph" DECIMAL(20,2) NOT NULL,
    "sumber_type" TEXT,
    "sumber_id" TEXT,
    "catatan" TEXT,
    "xml_draft" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bukti_potong_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID,
    "user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "cabang_tenant_id_idx" ON "cabang"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cabang_tenant_id_kode_key" ON "cabang"("tenant_id", "kode");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_idx" ON "memberships"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_tenant_id_key" ON "memberships"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "accounts_tenant_id_idx" ON "accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "accounts_tenant_id_parent_id_idx" ON "accounts"("tenant_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenant_id_kode_key" ON "accounts"("tenant_id", "kode");

-- CreateIndex
CREATE INDEX "tax_rates_tenant_id_idx" ON "tax_rates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_tenant_id_kode_key" ON "tax_rates"("tenant_id", "kode");

-- CreateIndex
CREATE INDEX "items_tenant_id_idx" ON "items"("tenant_id");

-- CreateIndex
CREATE INDEX "items_tenant_id_is_aktif_idx" ON "items"("tenant_id", "is_aktif");

-- CreateIndex
CREATE UNIQUE INDEX "items_tenant_id_kode_key" ON "items"("tenant_id", "kode");

-- CreateIndex
CREATE INDEX "item_stok_awal_tenant_id_idx" ON "item_stok_awal"("tenant_id");

-- CreateIndex
CREATE INDEX "item_stok_awal_item_id_cabang_id_idx" ON "item_stok_awal"("item_id", "cabang_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_stok_awal_item_id_cabang_id_tanggal_key" ON "item_stok_awal"("item_id", "cabang_id", "tanggal");

-- CreateIndex
CREATE INDEX "vendors_tenant_id_idx" ON "vendors"("tenant_id");

-- CreateIndex
CREATE INDEX "vendors_tenant_id_is_aktif_idx" ON "vendors"("tenant_id", "is_aktif");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_tenant_id_kode_key" ON "vendors"("tenant_id", "kode");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_is_aktif_idx" ON "customers"("tenant_id", "is_aktif");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_kode_key" ON "customers"("tenant_id", "kode");

-- CreateIndex
CREATE INDEX "fiscal_years_tenant_id_idx" ON "fiscal_years"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_tenant_id_kode_key" ON "fiscal_years"("tenant_id", "kode");

-- CreateIndex
CREATE INDEX "fiscal_periods_tenant_id_idx" ON "fiscal_periods"("tenant_id");

-- CreateIndex
CREATE INDEX "fiscal_periods_tenant_id_start_date_end_date_idx" ON "fiscal_periods"("tenant_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_tenant_id_fiscal_year_id_no_key" ON "fiscal_periods"("tenant_id", "fiscal_year_id", "no");

-- CreateIndex
CREATE INDEX "journals_tenant_id_idx" ON "journals"("tenant_id");

-- CreateIndex
CREATE INDEX "journals_tenant_id_status_tanggal_idx" ON "journals"("tenant_id", "status", "tanggal");

-- CreateIndex
CREATE INDEX "journals_fiscal_period_id_status_idx" ON "journals"("fiscal_period_id", "status");

-- CreateIndex
CREATE INDEX "journals_cabang_id_tanggal_idx" ON "journals"("cabang_id", "tanggal");

-- CreateIndex
CREATE INDEX "journals_sumber_sumber_ref_idx" ON "journals"("sumber", "sumber_ref");

-- CreateIndex
CREATE UNIQUE INDEX "journals_tenant_id_nomor_key" ON "journals"("tenant_id", "nomor");

-- CreateIndex
CREATE INDEX "journal_lines_journal_id_idx" ON "journal_lines"("journal_id");

-- CreateIndex
CREATE INDEX "journal_lines_tenant_id_account_id_idx" ON "journal_lines"("tenant_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_journal_id_key" ON "sales_invoices"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_hpp_journal_id_key" ON "sales_invoices"("hpp_journal_id");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_status_tanggal_idx" ON "sales_invoices"("tenant_id", "status", "tanggal");

-- CreateIndex
CREATE INDEX "sales_invoices_customer_id_status_idx" ON "sales_invoices"("customer_id", "status");

-- CreateIndex
CREATE INDEX "sales_invoices_fiscal_period_id_idx" ON "sales_invoices"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_tenant_id_nomor_key" ON "sales_invoices"("tenant_id", "nomor");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_invoice_id_idx" ON "sales_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_tenant_id_idx" ON "sales_invoice_lines"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_journal_id_key" ON "purchase_invoices"("journal_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_tenant_id_status_tanggal_idx" ON "purchase_invoices"("tenant_id", "status", "tanggal");

-- CreateIndex
CREATE INDEX "purchase_invoices_vendor_id_status_idx" ON "purchase_invoices"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "purchase_invoices_fiscal_period_id_idx" ON "purchase_invoices"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_tenant_id_nomor_key" ON "purchase_invoices"("tenant_id", "nomor");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_invoice_id_idx" ON "purchase_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_tenant_id_idx" ON "purchase_invoice_lines"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_bank_entries_journal_id_key" ON "cash_bank_entries"("journal_id");

-- CreateIndex
CREATE INDEX "cash_bank_entries_tenant_id_status_tanggal_idx" ON "cash_bank_entries"("tenant_id", "status", "tanggal");

-- CreateIndex
CREATE INDEX "cash_bank_entries_sales_invoice_id_idx" ON "cash_bank_entries"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "cash_bank_entries_purchase_invoice_id_idx" ON "cash_bank_entries"("purchase_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_bank_entries_tenant_id_nomor_key" ON "cash_bank_entries"("tenant_id", "nomor");

-- CreateIndex
CREATE INDEX "cash_bank_entry_lines_entry_id_idx" ON "cash_bank_entry_lines"("entry_id");

-- CreateIndex
CREATE INDEX "cash_bank_entry_lines_tenant_id_idx" ON "cash_bank_entry_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "stok_movements_tenant_id_item_id_cabang_id_occurred_at_idx" ON "stok_movements"("tenant_id", "item_id", "cabang_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stok_movements_sumber_type_sumber_id_idx" ON "stok_movements"("sumber_type", "sumber_id");

-- CreateIndex
CREATE INDEX "stok_lots_tenant_id_item_id_cabang_id_occurred_at_idx" ON "stok_lots"("tenant_id", "item_id", "cabang_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stok_lot_konsumsi_tenant_id_lot_id_idx" ON "stok_lot_konsumsi"("tenant_id", "lot_id");

-- CreateIndex
CREATE INDEX "stok_lot_konsumsi_movement_out_id_idx" ON "stok_lot_konsumsi"("movement_out_id");

-- CreateIndex
CREATE UNIQUE INDEX "stok_adjustments_journal_id_key" ON "stok_adjustments"("journal_id");

-- CreateIndex
CREATE INDEX "stok_adjustments_tenant_id_status_tanggal_idx" ON "stok_adjustments"("tenant_id", "status", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "stok_adjustments_tenant_id_nomor_key" ON "stok_adjustments"("tenant_id", "nomor");

-- CreateIndex
CREATE INDEX "stok_adjustment_lines_adjustment_id_idx" ON "stok_adjustment_lines"("adjustment_id");

-- CreateIndex
CREATE INDEX "stok_adjustment_lines_tenant_id_idx" ON "stok_adjustment_lines"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "aset_tetap_disposal_journal_id_key" ON "aset_tetap"("disposal_journal_id");

-- CreateIndex
CREATE INDEX "aset_tetap_tenant_id_status_idx" ON "aset_tetap"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "aset_tetap_cabang_id_idx" ON "aset_tetap"("cabang_id");

-- CreateIndex
CREATE UNIQUE INDEX "aset_tetap_tenant_id_kode_key" ON "aset_tetap"("tenant_id", "kode");

-- CreateIndex
CREATE UNIQUE INDEX "depresiasi_runs_journal_id_key" ON "depresiasi_runs"("journal_id");

-- CreateIndex
CREATE INDEX "depresiasi_runs_tenant_id_status_idx" ON "depresiasi_runs"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "depresiasi_runs_tenant_id_periode_key" ON "depresiasi_runs"("tenant_id", "periode");

-- CreateIndex
CREATE INDEX "depresiasi_lines_tenant_id_aset_id_idx" ON "depresiasi_lines"("tenant_id", "aset_id");

-- CreateIndex
CREATE UNIQUE INDEX "depresiasi_lines_run_id_aset_id_key" ON "depresiasi_lines"("run_id", "aset_id");

-- CreateIndex
CREATE INDEX "karyawan_tenant_id_is_active_idx" ON "karyawan"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "karyawan_tenant_id_kode_key" ON "karyawan"("tenant_id", "kode");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_journal_id_key" ON "payroll_runs"("journal_id");

-- CreateIndex
CREATE INDEX "payroll_runs_tenant_id_status_idx" ON "payroll_runs"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_cabang_id_periode_key" ON "payroll_runs"("tenant_id", "cabang_id", "periode");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_nomor_key" ON "payroll_runs"("tenant_id", "nomor");

-- CreateIndex
CREATE INDEX "payroll_lines_tenant_id_karyawan_id_idx" ON "payroll_lines"("tenant_id", "karyawan_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_run_id_karyawan_id_key" ON "payroll_lines"("run_id", "karyawan_id");

-- CreateIndex
CREATE INDEX "bukti_potong_tenant_id_jenis_pph_status_idx" ON "bukti_potong"("tenant_id", "jenis_pph", "status");

-- CreateIndex
CREATE INDEX "bukti_potong_sumber_type_sumber_id_idx" ON "bukti_potong"("sumber_type", "sumber_id");

-- CreateIndex
CREATE UNIQUE INDEX "bukti_potong_tenant_id_nomor_key" ON "bukti_potong"("tenant_id", "nomor");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabang" ADD CONSTRAINT "cabang_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_cabang" ADD CONSTRAINT "membership_cabang_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_cabang" ADD CONSTRAINT "membership_cabang_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_akun_pendapatan_id_fkey" FOREIGN KEY ("akun_pendapatan_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_akun_persediaan_id_fkey" FOREIGN KEY ("akun_persediaan_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_akun_hpp_id_fkey" FOREIGN KEY ("akun_hpp_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_akun_beban_id_fkey" FOREIGN KEY ("akun_beban_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_stok_awal" ADD CONSTRAINT "item_stok_awal_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_stok_awal" ADD CONSTRAINT "item_stok_awal_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_akun_utang_id_fkey" FOREIGN KEY ("akun_utang_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_akun_piutang_id_fkey" FOREIGN KEY ("akun_piutang_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_reversed_from_id_fkey" FOREIGN KEY ("reversed_from_id") REFERENCES "journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_akun_ar_id_fkey" FOREIGN KEY ("akun_ar_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_akun_pendapatan_id_fkey" FOREIGN KEY ("akun_pendapatan_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_akun_ap_id_fkey" FOREIGN KEY ("akun_ap_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_akun_debit_id_fkey" FOREIGN KEY ("akun_debit_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_entries" ADD CONSTRAINT "cash_bank_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_entries" ADD CONSTRAINT "cash_bank_entries_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_entries" ADD CONSTRAINT "cash_bank_entries_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_entries" ADD CONSTRAINT "cash_bank_entries_akun_kas_bank_id_fkey" FOREIGN KEY ("akun_kas_bank_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_entry_lines" ADD CONSTRAINT "cash_bank_entry_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "cash_bank_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_entry_lines" ADD CONSTRAINT "cash_bank_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_movements" ADD CONSTRAINT "stok_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_movements" ADD CONSTRAINT "stok_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_movements" ADD CONSTRAINT "stok_movements_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_lots" ADD CONSTRAINT "stok_lots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_lots" ADD CONSTRAINT "stok_lots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_lots" ADD CONSTRAINT "stok_lots_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_lots" ADD CONSTRAINT "stok_lots_movement_masuk_id_fkey" FOREIGN KEY ("movement_masuk_id") REFERENCES "stok_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_lot_konsumsi" ADD CONSTRAINT "stok_lot_konsumsi_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stok_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_lot_konsumsi" ADD CONSTRAINT "stok_lot_konsumsi_movement_out_id_fkey" FOREIGN KEY ("movement_out_id") REFERENCES "stok_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_adjustments" ADD CONSTRAINT "stok_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_adjustments" ADD CONSTRAINT "stok_adjustments_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_adjustments" ADD CONSTRAINT "stok_adjustments_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_adjustment_lines" ADD CONSTRAINT "stok_adjustment_lines_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stok_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_adjustment_lines" ADD CONSTRAINT "stok_adjustment_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aset_tetap" ADD CONSTRAINT "aset_tetap_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aset_tetap" ADD CONSTRAINT "aset_tetap_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aset_tetap" ADD CONSTRAINT "aset_tetap_akun_aset_id_fkey" FOREIGN KEY ("akun_aset_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aset_tetap" ADD CONSTRAINT "aset_tetap_akun_akumulasi_id_fkey" FOREIGN KEY ("akun_akumulasi_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aset_tetap" ADD CONSTRAINT "aset_tetap_akun_beban_id_fkey" FOREIGN KEY ("akun_beban_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depresiasi_runs" ADD CONSTRAINT "depresiasi_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depresiasi_runs" ADD CONSTRAINT "depresiasi_runs_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depresiasi_lines" ADD CONSTRAINT "depresiasi_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "depresiasi_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depresiasi_lines" ADD CONSTRAINT "depresiasi_lines_aset_id_fkey" FOREIGN KEY ("aset_id") REFERENCES "aset_tetap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "karyawan" ADD CONSTRAINT "karyawan_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "karyawan" ADD CONSTRAINT "karyawan_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_karyawan_id_fkey" FOREIGN KEY ("karyawan_id") REFERENCES "karyawan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_potong" ADD CONSTRAINT "bukti_potong_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_potong" ADD CONSTRAINT "bukti_potong_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_potong" ADD CONSTRAINT "bukti_potong_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
