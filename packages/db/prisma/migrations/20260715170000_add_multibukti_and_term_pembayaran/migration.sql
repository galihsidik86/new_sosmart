-- Fitur 1: bukti tambahan (multi-link) untuk 4 dokumen.
-- Fitur 2: master Termin Pembayaran + relasi opsional di faktur.

-- ---------- Fitur 1: link_bukti_tambahan (array URL, default kosong)
ALTER TABLE "journals"
  ADD COLUMN "link_bukti_tambahan" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "sales_invoices"
  ADD COLUMN "link_bukti_tambahan" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "purchase_invoices"
  ADD COLUMN "link_bukti_tambahan" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "cash_bank_entries"
  ADD COLUMN "link_bukti_tambahan" TEXT[] NOT NULL DEFAULT '{}';

-- ---------- Fitur 2: master term_pembayaran
CREATE TABLE "term_pembayaran" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  UUID NOT NULL,
  "nama"       TEXT NOT NULL,
  "hari"       INTEGER NOT NULL DEFAULT 0,
  "aktif"      BOOLEAN NOT NULL DEFAULT true,
  "urutan"     INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "term_pembayaran_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "term_pembayaran_tenant_id_nama_key"
  ON "term_pembayaran" ("tenant_id", "nama");
CREATE INDEX "term_pembayaran_tenant_id_aktif_idx"
  ON "term_pembayaran" ("tenant_id", "aktif");

-- ---------- Fitur 2: relasi opsional faktur -> term_pembayaran
ALTER TABLE "sales_invoices"
  ADD COLUMN "term_pembayaran_id" UUID;
ALTER TABLE "purchase_invoices"
  ADD COLUMN "term_pembayaran_id" UUID;

ALTER TABLE "sales_invoices"
  ADD CONSTRAINT "sales_invoices_term_pembayaran_id_fkey"
  FOREIGN KEY ("term_pembayaran_id") REFERENCES "term_pembayaran"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_invoices"
  ADD CONSTRAINT "purchase_invoices_term_pembayaran_id_fkey"
  FOREIGN KEY ("term_pembayaran_id") REFERENCES "term_pembayaran"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Catatan: RLS policy term_pembayaran ada di prisma/sql/rls.sql; grant
-- lentera_app diterapkan manual sekali setelah migrate deploy (lihat deploy).
