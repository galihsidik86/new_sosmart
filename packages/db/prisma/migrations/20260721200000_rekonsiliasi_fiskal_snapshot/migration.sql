-- Rekonsiliasi Fiskal PR-5: snapshot finalize (basis SPT).
-- RLS + GRANT di prisma/sql/rls.sql (dijalankan manual di DB live).

CREATE TABLE "rekonsiliasi_fiskal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "fiscal_year_id" UUID NOT NULL,
  "laba_komersial" DECIMAL(20,2) NOT NULL,
  "laba_fiskal" DECIMAL(20,2) NOT NULL,
  "pkp" DECIMAL(20,2) NOT NULL,
  "pph_terutang" DECIMAL(20,2) NOT NULL,
  "pph_kurang_bayar" DECIMAL(20,2) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "catatan" TEXT,
  "finalized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalized_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rekonsiliasi_fiskal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rekonsiliasi_fiskal_fiscal_year_id_key" ON "rekonsiliasi_fiskal"("fiscal_year_id");
CREATE INDEX "rekonsiliasi_fiskal_tenant_id_idx" ON "rekonsiliasi_fiskal"("tenant_id");
ALTER TABLE "rekonsiliasi_fiskal"
  ADD CONSTRAINT "rekonsiliasi_fiskal_fiscal_year_id_fkey"
  FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
