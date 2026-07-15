-- Manajemen projek sederhana: status lebih kaya, metadata (PIC/klien/
-- prioritas/nilai kontrak), dan tugas/milestone.

-- 1) status baru (append; urutan tak masalah)
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'PERENCANAAN';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'DITAHAN';

-- 2) enum baru
CREATE TYPE "ProjectPrioritas" AS ENUM ('RENDAH', 'SEDANG', 'TINGGI');
CREATE TYPE "ProjectTaskStatus" AS ENUM ('BELUM', 'PROSES', 'SELESAI');

-- 3) kolom baru di projects
ALTER TABLE "projects"
  ADD COLUMN "prioritas"     "ProjectPrioritas" NOT NULL DEFAULT 'SEDANG',
  ADD COLUMN "nilai_kontrak" DECIMAL(20,2),
  ADD COLUMN "pj_user_id"    UUID,
  ADD COLUMN "customer_id"   UUID;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_pj_user_id_fkey"
  FOREIGN KEY ("pj_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) tabel tugas/milestone
CREATE TABLE "project_tasks" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "nama"       TEXT NOT NULL,
  "deskripsi"  TEXT,
  "pj_user_id" UUID,
  "tenggat"    DATE,
  "status"     "ProjectTaskStatus" NOT NULL DEFAULT 'BELUM',
  "urutan"     INTEGER NOT NULL DEFAULT 0,
  "selesai_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_tasks_tenant_id_project_id_idx"
  ON "project_tasks" ("tenant_id", "project_id");

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_pj_user_id_fkey"
  FOREIGN KEY ("pj_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catatan: RLS policy project_tasks ada di prisma/sql/rls.sql; grant lentera_app
-- diterapkan manual sekali setelah migrate deploy.
