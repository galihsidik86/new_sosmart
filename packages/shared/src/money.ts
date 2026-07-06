import { Decimal } from 'decimal.js';

/**
 * Konvensi uang Lentera:
 *  - Semua nominal di DB pakai DECIMAL(20, 2) — TIDAK PERNAH float/number.
 *  - Lapisan service tukar pakai string atau Decimal, bukan number JS.
 *  - Formatting id-ID hanya di lapisan presentasi.
 *
 * Pembulatan pajak: seluruh fungsi hitungPpn/hitungPph* di bawah pakai
 * ROUND_HALF_EVEN (banker's rounding), BUKAN pembulatan ke bawah. Komentar
 * sebelumnya di sini mengklaim "pembulatan ke bawah (PER-03/PJ/2022)" tapi
 * tidak pernah diimplementasikan begitu — perbaiki dokumentasi ini supaya
 * cocok dengan kode. TODO kepatuhan: verifikasi ke peraturan DJP resmi apakah
 * PPN/PPh per faktur harus round-down, lalu ubah rounding mode kalau perlu
 * (blast radius besar — semua nominal pajak yang sudah ter-posting akan
 * terpengaruh, jadi jangan ubah tanpa konfirmasi eksplisit).
 */

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export type Money = Decimal;
export type MoneyInput = Decimal | string | number;

export const ZERO: Money = new Decimal(0);

export const money = (v: MoneyInput): Money => new Decimal(v);

export const sumMoney = (xs: MoneyInput[]): Money =>
  xs.reduce<Money>((acc, x) => acc.plus(new Decimal(x)), ZERO);

/** Untuk DB INSERT (string DECIMAL aman dari precision loss) */
export const moneyToDb = (v: MoneyInput): string => new Decimal(v).toFixed(2);

/** Format "Rp 1.234.567" — pembulatan ke satuan rupiah. */
export const formatRp = (v: MoneyInput, withDecimal = false): string => {
  const d = new Decimal(v);
  const fmt = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: withDecimal ? 2 : 0,
    maximumFractionDigits: withDecimal ? 2 : 0,
  });
  return 'Rp ' + fmt.format(d.toNumber());
};

/** Format "1.234.567" tanpa "Rp". */
export const formatPlain = (v: MoneyInput, withDecimal = false): string => {
  const d = new Decimal(v);
  const fmt = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: withDecimal ? 2 : 0,
    maximumFractionDigits: withDecimal ? 2 : 0,
  });
  return fmt.format(d.toNumber());
};

// ===============================================================
// PPN — Pajak Pertambahan Nilai
// ===============================================================

/**
 * PMK 131/2024 (berlaku 1 Jan 2025): tarif PPN 12%, tapi untuk
 * sebagian besar BKP/JKP DPP = 11/12 × Harga Jual → efektif 11%.
 * Untuk BKP mewah, DPP = Harga Jual penuh → efektif 12%.
 */
export type PpnSkema = 'EFEKTIF_11' | 'EFEKTIF_12' | 'KHUSUS';

export interface PpnParams {
  /** Tarif PPN dalam persen (11 atau 12). */
  tarif: number;
  /** Skema DPP. */
  skema: PpnSkema;
}

/**
 * Hitung PPN dari DPP (Dasar Pengenaan Pajak).
 *  - EFEKTIF_11 (DPP nilai lain 11/12): PPN = DPP × 11/12 × 12% = DPP × 11%
 *  - EFEKTIF_12 (BKP mewah): PPN = DPP × 12%
 *  - KHUSUS: caller wajib lewatkan DPP yang sudah disesuaikan.
 */
export const hitungPpn = (dpp: MoneyInput, params: PpnParams): Money => {
  const d = new Decimal(dpp);
  const tarif = new Decimal(params.tarif).div(100);
  if (params.skema === 'EFEKTIF_11') {
    return d.mul(new Decimal(11).div(12)).mul(tarif).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  }
  return d.mul(tarif).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
};

/**
 * DPP nilai lain (PMK 131/2024) — untuk faktur efektif 11% di era PPN 12%.
 * DPP_nilai_lain = Harga × 11/12.
 */
export const dppNilaiLain = (harga: MoneyInput): Money =>
  new Decimal(harga).mul(11).div(12).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

// ===============================================================
// PPh — Pajak Penghasilan (Withholding)
// ===============================================================

/**
 * PPh 23 — pemotongan oleh pemotong PPh 23 atas jasa/sewa/royalti.
 *  - 2% atas jasa (Pasal 23(1)(c))
 *  - 15% atas dividen, bunga, royalti, hadiah
 *  - Tarif naik 100% kalau penerima tanpa NPWP.
 */
export interface Pph23Params {
  tarif: number; // 2 atau 15
  penerimaPunyaNpwp: boolean;
}

export const hitungPph23 = (dpp: MoneyInput, params: Pph23Params): Money => {
  const d = new Decimal(dpp);
  const tarifEfektif = params.penerimaPunyaNpwp
    ? new Decimal(params.tarif)
    : new Decimal(params.tarif).mul(2);
  return d.mul(tarifEfektif).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
};

/**
 * PPh 4(2) final — sewa tanah/bangunan 10%, jasa konstruksi 2/3/4/6%.
 */
export const hitungPph4Ayat2 = (dpp: MoneyInput, tarif: number): Money =>
  new Decimal(dpp).mul(tarif).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);

/**
 * PPh Badan — UU HPP: 22%. UMKM (omzet ≤ Rp 4,8 M) bisa pakai
 * PP 55/2022 → 0,5% final dari peredaran bruto.
 */
export const hitungPphBadan = (penghasilanKenaPajak: MoneyInput, tarif = 22): Money =>
  new Decimal(penghasilanKenaPajak).mul(tarif).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);

export const hitungPphUmkmFinal = (omzet: MoneyInput): Money =>
  new Decimal(omzet).mul(0.5).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
