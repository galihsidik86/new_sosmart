-- Approval berjenjang konfigurable: aturan + langkah + permintaan + jejak aksi.

CREATE TYPE "ApprovalDocType" AS ENUM ('PENJUALAN', 'PEMBELIAN', 'KAS_BANK', 'JURNAL');
CREATE TYPE "ApprovalStatus" AS ENUM ('MENUNGGU', 'DISETUJUI', 'DITOLAK');
CREATE TYPE "ApprovalActionType" AS ENUM ('SETUJU', 'TOLAK');

CREATE TABLE "approval_rules" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  UUID NOT NULL,
  "doc_type"   "ApprovalDocType" NOT NULL,
  "min_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "catatan"    TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_rules_tenant_id_doc_type_idx" ON "approval_rules" ("tenant_id", "doc_type");

CREATE TABLE "approval_rule_steps" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     UUID NOT NULL,
  "rule_id"       UUID NOT NULL,
  "urutan"        INTEGER NOT NULL,
  "approver_role" "Role" NOT NULL,
  CONSTRAINT "approval_rule_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "approval_rule_steps_rule_id_urutan_key" ON "approval_rule_steps" ("rule_id", "urutan");

CREATE TABLE "approval_requests" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       UUID NOT NULL,
  "doc_type"        "ApprovalDocType" NOT NULL,
  "doc_id"          UUID NOT NULL,
  "cabang_id"       UUID,
  "amount"          DECIMAL(20,2) NOT NULL,
  "status"          "ApprovalStatus" NOT NULL DEFAULT 'MENUNGGU',
  "current_step"    INTEGER NOT NULL DEFAULT 1,
  "total_steps"     INTEGER NOT NULL,
  "step_roles"      TEXT NOT NULL,
  "requested_by_id" UUID,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  "resolved_at"     TIMESTAMP(3),
  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_requests_tenant_id_status_idx" ON "approval_requests" ("tenant_id", "status");
CREATE INDEX "approval_requests_tenant_id_doc_type_doc_id_idx" ON "approval_requests" ("tenant_id", "doc_type", "doc_id");

CREATE TABLE "approval_actions" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        UUID NOT NULL,
  "request_id"       UUID NOT NULL,
  "urutan"           INTEGER NOT NULL,
  "approver_role"    "Role" NOT NULL,
  "approver_user_id" UUID NOT NULL,
  "action"           "ApprovalActionType" NOT NULL,
  "catatan"          TEXT,
  "acted_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_actions_request_id_idx" ON "approval_actions" ("request_id");

ALTER TABLE "approval_rule_steps"
  ADD CONSTRAINT "approval_rule_steps_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "approval_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catatan: RLS policy + GRANT lentera_app untuk keempat tabel ada di
-- prisma/sql/rls.sql; terapkan manual sekali di DB live setelah migrate deploy.
