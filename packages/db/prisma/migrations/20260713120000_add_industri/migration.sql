-- Master Jenis Industri + Project.industriId
CREATE TABLE "industri" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "is_aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "industri_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "industri_tenant_id_kode_key" ON "industri"("tenant_id", "kode");
ALTER TABLE "industri" ADD CONSTRAINT "industri_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects" ADD COLUMN "industri_id" UUID;
CREATE INDEX "projects_industri_id_idx" ON "projects"("industri_id");
ALTER TABLE "projects" ADD CONSTRAINT "projects_industri_id_fkey"
    FOREIGN KEY ("industri_id") REFERENCES "industri"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catatan: RLS policy + GRANT lentera_app untuk tabel "industri" ada di
-- prisma/sql/rls.sql (dijalankan setelah migrate pada DB fresh). Untuk DB yang
-- sudah jalan, terapkan blok itu manual sekali setelah migrate deploy.
