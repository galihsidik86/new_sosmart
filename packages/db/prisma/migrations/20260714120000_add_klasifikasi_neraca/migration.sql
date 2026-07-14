-- Klasifikasi Neraca sebagai DATA di Account (bukan lagi ditebak dari prefix
-- kode COA di laporan). Bootstrap satu kali dari konvensi prefix seed.

-- 1. Enum type
CREATE TYPE "KlasifikasiNeraca" AS ENUM (
  'ASET_LANCAR',
  'ASET_TETAP',
  'LIABILITAS_PENDEK',
  'LIABILITAS_PANJANG'
);

-- 2. Kolom baru
ALTER TABLE "accounts"
  ADD COLUMN "klasifikasi_neraca" "KlasifikasiNeraca",
  ADD COLUMN "is_kas_setara" BOOLEAN NOT NULL DEFAULT false;

-- 3. Backfill dari konvensi prefix yang selama ini dipakai laporan
--    (1-2x = aset tetap, sisa aset = lancar; 2-2x = liab panjang, sisa = pendek).
UPDATE "accounts"
  SET "klasifikasi_neraca" = CASE
    WHEN "kind" = 'ASET' AND "kode" LIKE '1-2%' THEN 'ASET_TETAP'::"KlasifikasiNeraca"
    WHEN "kind" = 'ASET' THEN 'ASET_LANCAR'::"KlasifikasiNeraca"
    WHEN "kind" = 'LIABILITAS' AND "kode" LIKE '2-2%' THEN 'LIABILITAS_PANJANG'::"KlasifikasiNeraca"
    WHEN "kind" = 'LIABILITAS' THEN 'LIABILITAS_PENDEK'::"KlasifikasiNeraca"
    ELSE NULL
  END
  WHERE "kind" IN ('ASET', 'LIABILITAS');

-- 4. Flag kas & setara kas (Kas 1-101, Bank 1-102x) — dipakai laporan Arus Kas.
UPDATE "accounts"
  SET "is_kas_setara" = true
  WHERE "kode" = '1-101' OR "kode" LIKE '1-102%';
