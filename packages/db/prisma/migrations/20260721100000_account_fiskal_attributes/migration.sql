-- Rekonsiliasi Fiskal PR-1: atribut fiskal pada Account (komersial vs pajak).
-- Tabel `accounts` sudah ter-scope RLS → kolom baru otomatis ikut ter-proteksi;
-- tidak perlu ubah policy RLS.

CREATE TYPE "FiskalTreatment" AS ENUM ('NONE', 'NON_DEDUCTIBLE', 'PARTIAL', 'FINAL_INCOME', 'NON_OBJECT', 'CADANGAN');
CREATE TYPE "FiskalKategori" AS ENUM ('NATURA', 'ENTERTAINMENT', 'SUMBANGAN', 'SANKSI_PAJAK', 'PENGHASILAN_FINAL', 'BUNGA', 'SEWA', 'PENYUSUTAN', 'CADANGAN', 'LAINNYA');

ALTER TABLE "accounts"
  ADD COLUMN "fiskal_treatment" "FiskalTreatment" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "fiskal_persen" DECIMAL(5, 2),
  ADD COLUMN "fiskal_kategori" "FiskalKategori";
