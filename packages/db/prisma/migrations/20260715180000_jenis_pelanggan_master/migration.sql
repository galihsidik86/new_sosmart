-- Jenis pelanggan: dari enum global TipeCustomer -> master per-tenant.
-- Data lama tiap tenant dipetakan jadi baris master supaya klasifikasi
-- yang ada tidak hilang (mis. Distributor/Ritel untuk tenant non-MarkPlus).

-- 1) tabel master
CREATE TABLE "jenis_pelanggan" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  UUID NOT NULL,
  "nama"       TEXT NOT NULL,
  "aktif"      BOOLEAN NOT NULL DEFAULT true,
  "urutan"     INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "jenis_pelanggan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "jenis_pelanggan_tenant_id_nama_key"
  ON "jenis_pelanggan" ("tenant_id", "nama");
CREATE INDEX "jenis_pelanggan_tenant_id_aktif_idx"
  ON "jenis_pelanggan" ("tenant_id", "aktif");

-- 2) kolom FK di customers
ALTER TABLE "customers" ADD COLUMN "jenis_pelanggan_id" UUID;

-- 3) buat master dari nilai enum yang dipakai tiap tenant, lalu tautkan
INSERT INTO "jenis_pelanggan" ("tenant_id", "nama", "urutan", "updated_at")
SELECT DISTINCT c."tenant_id",
  CASE c."tipe"::text
    WHEN 'DISTRIBUTOR' THEN 'Distributor'
    WHEN 'RITEL'       THEN 'Ritel'
    WHEN 'KORPORAT'    THEN 'Korporat'
    WHEN 'KOPERASI'    THEN 'Koperasi'
    WHEN 'PEMERINTAH'  THEN 'Pemerintah'
    ELSE 'Lainnya'
  END,
  0, CURRENT_TIMESTAMP
FROM "customers" c;

UPDATE "customers" c
SET "jenis_pelanggan_id" = jp."id"
FROM "jenis_pelanggan" jp
WHERE jp."tenant_id" = c."tenant_id"
  AND jp."nama" = CASE c."tipe"::text
    WHEN 'DISTRIBUTOR' THEN 'Distributor'
    WHEN 'RITEL'       THEN 'Ritel'
    WHEN 'KORPORAT'    THEN 'Korporat'
    WHEN 'KOPERASI'    THEN 'Koperasi'
    WHEN 'PEMERINTAH'  THEN 'Pemerintah'
    ELSE 'Lainnya'
  END;

-- 4) FK constraint
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_jenis_pelanggan_id_fkey"
  FOREIGN KEY ("jenis_pelanggan_id") REFERENCES "jenis_pelanggan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) buang kolom & enum lama
ALTER TABLE "customers" DROP COLUMN "tipe";
DROP TYPE "TipeCustomer";

-- Catatan: RLS policy jenis_pelanggan ada di prisma/sql/rls.sql; grant
-- lentera_app diterapkan manual sekali setelah migrate deploy.
