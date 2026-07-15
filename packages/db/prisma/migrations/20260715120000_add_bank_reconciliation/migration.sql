-- Rekonsiliasi bank: header + join baris jurnal yang sudah kliring.

CREATE TYPE "BankReconciliationStatus" AS ENUM ('DRAFT', 'SELESAI');

CREATE TABLE "bank_reconciliations" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "cabang_id"           UUID,
  "akun_id"             UUID NOT NULL,
  "tanggal"             DATE NOT NULL,
  "saldo_rekening_koran" DECIMAL(20,2) NOT NULL,
  "saldo_buku"          DECIMAL(20,2) NOT NULL DEFAULT 0,
  "selisih"             DECIMAL(20,2) NOT NULL DEFAULT 0,
  "status"              "BankReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
  "catatan"             TEXT,
  "created_by_id"       UUID,
  "finalized_at"        TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_reconciliations_tenant_id_akun_id_idx"
  ON "bank_reconciliations" ("tenant_id", "akun_id");

CREATE TABLE "bank_reconciliation_lines" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         UUID NOT NULL,
  "reconciliation_id" UUID NOT NULL,
  "journal_line_id"   UUID NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_reconciliation_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_reconciliation_lines_journal_line_id_key"
  ON "bank_reconciliation_lines" ("journal_line_id");
CREATE INDEX "bank_reconciliation_lines_reconciliation_id_idx"
  ON "bank_reconciliation_lines" ("reconciliation_id");

ALTER TABLE "bank_reconciliations"
  ADD CONSTRAINT "bank_reconciliations_akun_id_fkey"
  FOREIGN KEY ("akun_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bank_reconciliation_lines"
  ADD CONSTRAINT "bank_reconciliation_lines_reconciliation_id_fkey"
  FOREIGN KEY ("reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bank_reconciliation_lines"
  ADD CONSTRAINT "bank_reconciliation_lines_journal_line_id_fkey"
  FOREIGN KEY ("journal_line_id") REFERENCES "journal_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catatan: RLS policy + GRANT lentera_app untuk kedua tabel ada di
-- prisma/sql/rls.sql (dijalankan setelah migrate pada DB fresh). Untuk DB yang
-- sudah jalan, terapkan blok itu manual sekali setelah migrate deploy.
