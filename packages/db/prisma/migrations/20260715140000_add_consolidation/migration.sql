-- Konsolidasi grup: flag intercompany di akun + grup + anggota grup.

ALTER TABLE "accounts"
  ADD COLUMN "is_intercompany" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "groups" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  UUID NOT NULL,
  "nama"       TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "groups_tenant_id_idx" ON "groups" ("tenant_id");

CREATE TABLE "group_members" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        UUID NOT NULL,
  "group_id"         UUID NOT NULL,
  "member_tenant_id" UUID NOT NULL,
  "ownership_pct"    DECIMAL(7,4) NOT NULL DEFAULT 100,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "group_members_group_id_member_tenant_id_key"
  ON "group_members" ("group_id", "member_tenant_id");
CREATE INDEX "group_members_tenant_id_idx" ON "group_members" ("tenant_id");

ALTER TABLE "group_members"
  ADD CONSTRAINT "group_members_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catatan: RLS policy + GRANT lentera_app untuk groups & group_members ada di
-- prisma/sql/rls.sql; terapkan manual sekali di DB live setelah migrate deploy.
