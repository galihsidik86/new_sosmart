-- Rekonsiliasi Fiskal PR-4: koreksi fiskal manual.
-- RLS + GRANT di prisma/sql/rls.sql (dijalankan manual di DB live).

CREATE TYPE "KoreksiJenis" AS ENUM ('POSITIF', 'NEGATIF');
CREATE TYPE "KoreksiBeda" AS ENUM ('TETAP', 'SEMENTARA');
CREATE TYPE "KoreksiSumber" AS ENUM ('OTOMATIS', 'MANUAL');

CREATE TABLE "koreksi_fiskal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "fiscal_year_id" UUID NOT NULL,
  "jenis" "KoreksiJenis" NOT NULL,
  "beda" "KoreksiBeda" NOT NULL DEFAULT 'TETAP',
  "kategori" "FiskalKategori" NOT NULL DEFAULT 'LAINNYA',
  "deskripsi" TEXT NOT NULL,
  "akun_id" UUID,
  "koreksi" DECIMAL(20,2) NOT NULL,
  "sumber" "KoreksiSumber" NOT NULL DEFAULT 'MANUAL',
  "catatan" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "koreksi_fiskal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "koreksi_fiskal_tenant_id_fiscal_year_id_idx" ON "koreksi_fiskal"("tenant_id", "fiscal_year_id");
ALTER TABLE "koreksi_fiskal"
  ADD CONSTRAINT "koreksi_fiskal_fiscal_year_id_fkey"
  FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
