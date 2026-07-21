-- Rekonsiliasi Fiskal PR-3: parameter penyusutan fiskal pada AsetTetap.
-- aset_tetap sudah ter-scope RLS -> kolom baru otomatis ikut ter-proteksi.

ALTER TABLE "aset_tetap"
  ADD COLUMN "metode_fiskal" "MetodePenyusutan" NOT NULL DEFAULT 'GARIS_LURUS',
  ADD COLUMN "masa_manfaat_fiskal_bulan" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN "nilai_residu_fiskal" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- Backfill aset existing: metode fiskal = metode komersial; masa manfaat fiskal
-- = default kelompok Pasal 11 UU PPh; residu fiskal = 0 (disusutkan habis).
UPDATE "aset_tetap" SET
  "metode_fiskal" = "metode",
  "masa_manfaat_fiskal_bulan" = CASE "kelompok"
    WHEN 'BANGUNAN_PERMANEN'     THEN 240
    WHEN 'BANGUNAN_NON_PERMANEN' THEN 120
    WHEN 'KELOMPOK_I'            THEN 48
    WHEN 'KELOMPOK_II'           THEN 96
    WHEN 'KELOMPOK_III'          THEN 192
    WHEN 'KELOMPOK_IV'           THEN 240
    ELSE 48
  END,
  "nilai_residu_fiskal" = 0;
