-- Master JenisProjek (dikelola per perusahaan) + kolom projects.jenis_projek_id.
-- Sekaligus PINDAHKAN kategori "Consumer/Brand/Personal Based" dari jenis_pelanggan
-- (salah tempat) → jenis_projek, lalu hapus dari jenis_pelanggan (customers ikut
-- ter-SET NULL via FK). RLS + GRANT jenis_projek di prisma/sql/rls.sql (manual).

CREATE TABLE "jenis_projek" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "nama" TEXT NOT NULL,
  "aktif" BOOLEAN NOT NULL DEFAULT true,
  "urutan" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "jenis_projek_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "jenis_projek_tenant_id_nama_key" ON "jenis_projek"("tenant_id", "nama");
CREATE INDEX "jenis_projek_tenant_id_aktif_idx" ON "jenis_projek"("tenant_id", "aktif");

ALTER TABLE "projects" ADD COLUMN "jenis_projek_id" UUID;
CREATE INDEX "projects_jenis_projek_id_idx" ON "projects"("jenis_projek_id");
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_jenis_projek_id_fkey"
  FOREIGN KEY ("jenis_projek_id") REFERENCES "jenis_projek"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pindahkan kategori projek yang sempat masuk ke jenis_pelanggan.
INSERT INTO "jenis_projek" ("id", "tenant_id", "nama", "aktif", "urutan", "created_at", "updated_at")
SELECT gen_random_uuid(), "tenant_id", "nama", "aktif", "urutan", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "jenis_pelanggan"
WHERE "nama" IN ('Consumer Based', 'Brand Based', 'Personal Based');

-- Kembalikan jenis_pelanggan ke semula (customers.jenis_pelanggan_id ter-SET NULL via FK).
DELETE FROM "jenis_pelanggan"
WHERE "nama" IN ('Consumer Based', 'Brand Based', 'Personal Based');
