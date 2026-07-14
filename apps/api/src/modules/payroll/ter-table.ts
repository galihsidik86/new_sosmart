/**
 * Tarif Efektif Rata-rata (TER) Bulanan PPh 21 — PMK 168/2023 (Lampiran).
 *
 * Berlaku sejak Januari 2024. Dipakai untuk masa pajak Januari–November;
 * masa pajak Desember pakai tarif progresif Pasal 17 UU PPh atas
 * penghasilan setahun.
 *
 * Sumber verifikasi: reproduksi publik dari PMK 168/2023 Lampiran
 * (klikpajak, kiakrikil, kalkupro, PDF DJP). Kalau ada revisi PTKP karena
 * inflasi, UPDATE file ini + PTKP_TO_KATEGORI di
 * `packages/shared/src/enums.ts`.
 *
 * ⚠ QA CATATAN:
 *   Bracket >Rp1M/bulan (rate 30–34%) di kategori B & C direkonstruksi dari
 *   pattern progresif — sumber online punya inkonsistensi di 3–4 baris teratas.
 *   Semua kategori dikonfirmasi punya cap 34%. Verifikasi ulang Lampiran PDF
 *   resmi PMK 168/2023 SEBELUM deploy ke klien dengan karyawan berpenghasilan
 *   >Rp700jt/bulan. Bracket bawah (yang mencakup >99% pegawai Indonesia)
 *   sudah cocok dengan sumber-sumber independen.
 *
 * Struktur data:
 *   ceiling INKLUSIF (bruto ≤ ceiling → tarif itu). Bracket terakhir dgn
 *   ceiling = Number.POSITIVE_INFINITY mewakili "di atas X".
 *
 * Kategori PTKP:
 *   A → TK/0 (54jt), TK/1 (58,5jt), K/0 (58,5jt)
 *   B → TK/2 (63jt), TK/3 (67,5jt), K/1 (63jt), K/2 (67,5jt)
 *   C → K/3 (72jt)
 */

import { PtkpKategori } from '@lentera/db';

export interface TerBracket {
  /** Batas atas penghasilan bruto bulanan (inklusif), rupiah. */
  ceiling: number;
  /** Tarif efektif dalam persen. */
  tarif: number;
}

const INF = Number.POSITIVE_INFINITY;

/** Kategori A (44 lapisan). PTKP TK/0, TK/1, K/0. */
const TER_A: TerBracket[] = [
  { ceiling:      5_400_000, tarif:  0 },
  { ceiling:      5_650_000, tarif:  0.25 },
  { ceiling:      5_950_000, tarif:  0.5 },
  { ceiling:      6_300_000, tarif:  0.75 },
  { ceiling:      6_750_000, tarif:  1 },
  { ceiling:      7_500_000, tarif:  1.25 },
  { ceiling:      8_550_000, tarif:  1.5 },
  { ceiling:      9_650_000, tarif:  1.75 },
  { ceiling:     10_050_000, tarif:  2 },
  { ceiling:     10_350_000, tarif:  2.25 },
  { ceiling:     10_700_000, tarif:  2.5 },
  { ceiling:     11_050_000, tarif:  3 },
  { ceiling:     11_600_000, tarif:  3.5 },
  { ceiling:     12_500_000, tarif:  4 },
  { ceiling:     13_750_000, tarif:  5 },
  { ceiling:     15_100_000, tarif:  6 },
  { ceiling:     16_950_000, tarif:  7 },
  { ceiling:     19_750_000, tarif:  8 },
  { ceiling:     24_150_000, tarif:  9 },
  { ceiling:     26_450_000, tarif: 10 },
  { ceiling:     28_000_000, tarif: 11 },
  { ceiling:     30_050_000, tarif: 12 },
  { ceiling:     32_400_000, tarif: 13 },
  { ceiling:     35_400_000, tarif: 14 },
  { ceiling:     39_100_000, tarif: 15 },
  { ceiling:     43_850_000, tarif: 16 },
  { ceiling:     47_800_000, tarif: 17 },
  { ceiling:     51_400_000, tarif: 18 },
  { ceiling:     56_300_000, tarif: 19 },
  { ceiling:     62_200_000, tarif: 20 },
  { ceiling:     68_600_000, tarif: 21 },
  { ceiling:     77_500_000, tarif: 22 },
  { ceiling:     89_000_000, tarif: 23 },
  { ceiling:    103_000_000, tarif: 24 },
  { ceiling:    125_000_000, tarif: 25 },
  { ceiling:    157_000_000, tarif: 26 },
  { ceiling:    206_000_000, tarif: 27 },
  { ceiling:    337_000_000, tarif: 28 },
  { ceiling:    454_000_000, tarif: 29 },
  { ceiling:    550_000_000, tarif: 30 },
  { ceiling:    695_000_000, tarif: 31 },
  { ceiling:    910_000_000, tarif: 32 },
  { ceiling:  1_400_000_000, tarif: 33 },
  { ceiling: INF,            tarif: 34 },
];

/** Kategori B (40 lapisan). PTKP TK/2, TK/3, K/1, K/2. */
const TER_B: TerBracket[] = [
  { ceiling:      6_200_000, tarif:  0 },
  { ceiling:      6_500_000, tarif:  0.25 },
  { ceiling:      6_850_000, tarif:  0.5 },
  { ceiling:      7_300_000, tarif:  0.75 },
  { ceiling:      9_200_000, tarif:  1 },
  { ceiling:     10_750_000, tarif:  1.5 },
  { ceiling:     11_250_000, tarif:  2 },
  { ceiling:     11_600_000, tarif:  2.5 },
  { ceiling:     12_600_000, tarif:  3 },
  { ceiling:     13_600_000, tarif:  4 },
  { ceiling:     14_950_000, tarif:  5 },
  { ceiling:     16_400_000, tarif:  6 },
  { ceiling:     18_450_000, tarif:  7 },
  { ceiling:     21_850_000, tarif:  8 },
  { ceiling:     26_000_000, tarif:  9 },
  { ceiling:     27_700_000, tarif: 10 },
  { ceiling:     29_350_000, tarif: 11 },
  { ceiling:     31_450_000, tarif: 12 },
  { ceiling:     33_950_000, tarif: 13 },
  { ceiling:     37_100_000, tarif: 14 },
  { ceiling:     41_100_000, tarif: 15 },
  { ceiling:     45_800_000, tarif: 16 },
  { ceiling:     49_500_000, tarif: 17 },
  { ceiling:     53_800_000, tarif: 18 },
  { ceiling:     58_500_000, tarif: 19 },
  { ceiling:     64_000_000, tarif: 20 },
  { ceiling:     71_000_000, tarif: 21 },
  { ceiling:     80_000_000, tarif: 22 },
  { ceiling:     93_000_000, tarif: 23 },
  { ceiling:    109_000_000, tarif: 24 },
  { ceiling:    129_000_000, tarif: 25 },
  { ceiling:    163_000_000, tarif: 26 },
  { ceiling:    211_000_000, tarif: 27 },
  { ceiling:    374_000_000, tarif: 28 },
  { ceiling:    459_000_000, tarif: 29 },
  { ceiling:    555_000_000, tarif: 30 },
  { ceiling:    704_000_000, tarif: 31 },
  { ceiling:    957_000_000, tarif: 32 },
  { ceiling:  1_405_000_000, tarif: 33 },
  { ceiling: INF,            tarif: 34 },
];

/** Kategori C (41 lapisan). PTKP K/3. */
const TER_C: TerBracket[] = [
  { ceiling:      6_600_000, tarif:  0 },
  { ceiling:      6_950_000, tarif:  0.25 },
  { ceiling:      7_350_000, tarif:  0.5 },
  { ceiling:      7_800_000, tarif:  0.75 },
  { ceiling:      8_850_000, tarif:  1 },
  { ceiling:      9_800_000, tarif:  1.25 },
  { ceiling:     10_950_000, tarif:  1.5 },
  { ceiling:     11_200_000, tarif:  1.75 },
  { ceiling:     12_050_000, tarif:  2 },
  { ceiling:     12_950_000, tarif:  2.25 },
  { ceiling:     14_150_000, tarif:  3 },
  { ceiling:     15_550_000, tarif:  4 },
  { ceiling:     17_050_000, tarif:  5 },
  { ceiling:     19_500_000, tarif:  6 },
  { ceiling:     22_700_000, tarif:  7 },
  { ceiling:     26_600_000, tarif:  8 },
  { ceiling:     28_100_000, tarif:  9 },
  { ceiling:     30_100_000, tarif: 10 },
  { ceiling:     32_600_000, tarif: 11 },
  { ceiling:     35_400_000, tarif: 12 },
  { ceiling:     38_900_000, tarif: 13 },
  { ceiling:     43_000_000, tarif: 14 },
  { ceiling:     47_400_000, tarif: 15 },
  { ceiling:     51_200_000, tarif: 16 },
  { ceiling:     55_800_000, tarif: 17 },
  { ceiling:     60_400_000, tarif: 18 },
  { ceiling:     66_700_000, tarif: 19 },
  { ceiling:     74_500_000, tarif: 20 },
  { ceiling:     83_200_000, tarif: 21 },
  { ceiling:     95_600_000, tarif: 22 },
  { ceiling:    110_000_000, tarif: 23 },
  { ceiling:    134_000_000, tarif: 24 },
  { ceiling:    169_000_000, tarif: 25 },
  { ceiling:    221_000_000, tarif: 26 },
  { ceiling:    390_000_000, tarif: 27 },
  { ceiling:    463_000_000, tarif: 28 },
  { ceiling:    561_000_000, tarif: 29 },
  { ceiling:    709_000_000, tarif: 30 },
  { ceiling:    965_000_000, tarif: 32 },
  { ceiling:  1_419_000_000, tarif: 33 },
  { ceiling: INF,            tarif: 34 },
];

const TABLES: Record<PtkpKategori, TerBracket[]> = {
  A: TER_A,
  B: TER_B,
  C: TER_C,
};

/**
 * Cari tarif TER PPh 21 bulanan untuk bruto tertentu.
 *
 * Algoritma: scan ascending, ambil bracket pertama yang ceiling >= bruto.
 * Karena bracket terakhir ceiling = Infinity, selalu ada match.
 *
 * @param kategori Kategori TER (dari PTKP status karyawan, lihat PTKP_TO_KATEGORI)
 * @param brutoBulanan Penghasilan bruto bulanan dalam rupiah
 * @returns Tarif efektif dalam persen (mis. 5.25 untuk 5.25%)
 */
export function lookupTer(kategori: PtkpKategori, brutoBulanan: number): number {
  const table = TABLES[kategori];
  for (const b of table) {
    if (brutoBulanan <= b.ceiling) return b.tarif;
  }
  // Tidak akan pernah reach karena bracket terakhir ceiling = Infinity,
  // tapi defensive fallback.
  return table[table.length - 1]!.tarif;
}

/**
 * Ambang bruto bulanan. DI ATAS ini, tarif TER jatuh ke bracket teratas yang
 * masih DIREKONSTRUKSI dari pola progresif (belum diverifikasi ke Lampiran PDF
 * resmi PMK 168/2023 — lihat ⚠ QA CATATAN di atas). Payroll MEM-BLOKIR posting
 * untuk penghasilan di zona ini kecuali user eksplisit konfirmasi sudah
 * verifikasi manual. Bracket bawah–menengah (>99% pegawai) tidak terpengaruh.
 */
export const TER_UNVERIFIED_BRUTO_MIN = 700_000_000;

export interface TerLookup {
  tarif: number;
  /** true = tarif dari bracket teratas yang belum terverifikasi (bruto > ambang). */
  unverified: boolean;
}

/** Seperti lookupTer, plus penanda apakah hasil dari zona bracket belum terverifikasi. */
export function lookupTerDetail(
  kategori: PtkpKategori,
  brutoBulanan: number,
): TerLookup {
  return {
    tarif: lookupTer(kategori, brutoBulanan),
    unverified: brutoBulanan > TER_UNVERIFIED_BRUTO_MIN,
  };
}
