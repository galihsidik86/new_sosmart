-- Rekonsiliasi Fiskal PR-2: parameter PPh Badan per tahun + kompensasi kerugian.
-- RLS + GRANT untuk kedua tabel di prisma/sql/rls.sql (dijalankan manual di DB live).

CREATE TYPE "SkemaPphBadan" AS ENUM ('BADAN_UMUM', 'UMKM_FINAL');

CREATE TABLE "pph_badan_setting" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "fiscal_year_id" UUID NOT NULL,
  "skema" "SkemaPphBadan" NOT NULL DEFAULT 'BADAN_UMUM',
  "peredaran_bruto" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "use_fasilitas_31e" BOOLEAN NOT NULL DEFAULT true,
  "tarif" DECIMAL(5,2) NOT NULL DEFAULT 22,
  "kredit_pajak_manual" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pph_badan_setting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pph_badan_setting_fiscal_year_id_key" ON "pph_badan_setting"("fiscal_year_id");
CREATE INDEX "pph_badan_setting_tenant_id_idx" ON "pph_badan_setting"("tenant_id");
ALTER TABLE "pph_badan_setting"
  ADD CONSTRAINT "pph_badan_setting_fiscal_year_id_fkey"
  FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "kompensasi_kerugian" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "fiscal_year_id" UUID NOT NULL,
  "tahun_rugi" TEXT NOT NULL,
  "nilai_rugi" DECIMAL(20,2) NOT NULL,
  "dipakai" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kompensasi_kerugian_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kompensasi_kerugian_tenant_id_fiscal_year_id_idx" ON "kompensasi_kerugian"("tenant_id", "fiscal_year_id");
ALTER TABLE "kompensasi_kerugian"
  ADD CONSTRAINT "kompensasi_kerugian_fiscal_year_id_fkey"
  FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
