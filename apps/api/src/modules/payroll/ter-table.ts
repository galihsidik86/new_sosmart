/**
 * Tarif Efektif Rata-rata (TER) Bulanan PPh 21.
 *
 * ⚠ DEMO / PLACEHOLDER TABLE — bukan reproduksi tabel resmi pemerintah.
 *
 * Bracket di bawah hanya ILUSTRASI struktur lookup yang dipakai engine.
 * Untuk produksi, WAJIB ganti dengan bracket lengkap dari sumber resmi
 * (peraturan turunan DJP yang berlaku). Bracket resmi punya jauh lebih
 * banyak entries dengan tarif yang naik bertahap halus.
 *
 * Implementasi engine ini agnostic terhadap jumlah bracket — tinggal
 * isi array TABLES[kategori] dengan entries final, sorted ascending
 * berdasar ceiling.
 *
 * Mapping kategori PTKP:
 *   A → TK_0
 *   B → TK_1, K_0, TK_2
 *   C → TK_3, K_1, K_2, K_3, HB_*
 */

import { PtkpKategori } from '@lentera/db';

export interface TerBracket {
  /** Batas atas penghasilan bruto bulanan (inklusif), rupiah. */
  ceiling: number;
  /** Tarif efektif dalam persen. */
  tarif: number;
}

/** ⚠ DEMO ONLY — ganti dengan bracket resmi sebelum production. */
const TER_DEMO_A: TerBracket[] = [
  { ceiling: 5_400_000, tarif: 0 },
  { ceiling: 7_500_000, tarif: 1.5 },
  { ceiling: 10_700_000, tarif: 4 },
  { ceiling: 15_100_000, tarif: 9 },
  { ceiling: 24_150_000, tarif: 12 },
  { ceiling: 50_000_000, tarif: 20 },
  { ceiling: 100_000_000, tarif: 26 },
  { ceiling: 250_000_000, tarif: 30 },
  { ceiling: 1_000_000_000, tarif: 34 },
];

/** ⚠ DEMO ONLY. */
const TER_DEMO_B: TerBracket[] = [
  { ceiling: 6_200_000, tarif: 0 },
  { ceiling: 7_300_000, tarif: 0.75 },
  { ceiling: 11_250_000, tarif: 2 },
  { ceiling: 14_950_000, tarif: 5 },
  { ceiling: 21_850_000, tarif: 8 },
  { ceiling: 45_800_000, tarif: 16 },
  { ceiling: 100_000_000, tarif: 24 },
  { ceiling: 250_000_000, tarif: 30 },
  { ceiling: 1_000_000_000, tarif: 34 },
];

/** ⚠ DEMO ONLY. */
const TER_DEMO_C: TerBracket[] = [
  { ceiling: 6_600_000, tarif: 0 },
  { ceiling: 7_800_000, tarif: 0.75 },
  { ceiling: 12_050_000, tarif: 2 },
  { ceiling: 15_550_000, tarif: 5 },
  { ceiling: 22_700_000, tarif: 8 },
  { ceiling: 47_400_000, tarif: 16 },
  { ceiling: 100_000_000, tarif: 24 },
  { ceiling: 250_000_000, tarif: 30 },
  { ceiling: 1_000_000_000, tarif: 34 },
];

const TABLES: Record<PtkpKategori, TerBracket[]> = {
  A: TER_DEMO_A,
  B: TER_DEMO_B,
  C: TER_DEMO_C,
};

/**
 * Cari tarif TER untuk bruto bulanan tertentu.
 *
 * Algoritma: scan ascending, ambil bracket pertama yang ceiling >= bruto.
 * Kalau bruto > semua ceiling, fallback ke tarif bracket terakhir.
 */
export function lookupTer(kategori: PtkpKategori, brutoBulanan: number): number {
  const table = TABLES[kategori];
  for (const b of table) {
    if (brutoBulanan <= b.ceiling) return b.tarif;
  }
  return table[table.length - 1]!.tarif;
}
