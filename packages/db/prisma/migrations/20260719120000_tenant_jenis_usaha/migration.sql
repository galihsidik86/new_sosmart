-- Jenis usaha badan: DAGANG (default) atau JASA.
-- Untuk JASA: item master default jasa, menu persediaan disembunyikan.
CREATE TYPE "JenisUsaha" AS ENUM ('DAGANG', 'JASA');

ALTER TABLE "tenants"
  ADD COLUMN "jenis_usaha" "JenisUsaha" NOT NULL DEFAULT 'DAGANG';
