/**
 * Unit tests untuk helper pajak Indonesia.
 * Reference: PMK 131/2024 (PPN), Pasal 23 UU PPh.
 *
 * Test ini menguji invariant matematis — bukan integrasi DB. Cepat & deterministik.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  hitungPpn,
  dppNilaiLain,
  hitungPph23,
  hitungPph4Ayat2,
  hitungPphBadan,
  hitungPphUmkmFinal,
  sumMoney,
  formatRp,
  formatPlain,
} from '../money.js';

describe('hitungPpn — PMK 131/2024', () => {
  it('EFEKTIF_11: DPP 1jt × 11% = 91,666.67', () => {
    // DPP nilai lain 11/12 × 12% = efektif 11%
    // 1.000.000 × 11/12 × 12% = 110.000 (tepat 11%)
    const ppn = hitungPpn('1000000', { tarif: 12, skema: 'EFEKTIF_11' });
    expect(ppn.toFixed(2)).toBe('110000.00');
  });

  it('EFEKTIF_12: BKP mewah pakai DPP penuh × 12%', () => {
    const ppn = hitungPpn('1000000', { tarif: 12, skema: 'EFEKTIF_12' });
    expect(ppn.toFixed(2)).toBe('120000.00');
  });

  it('rounding HALF_EVEN: 95.5 → 96', () => {
    // 95.50 input untuk genap → 96
    const ppn = hitungPpn('795.83', { tarif: 12, skema: 'EFEKTIF_12' });
    expect(ppn.toFixed(2)).toBe('95.50');
  });
});

describe('dppNilaiLain', () => {
  it('1jt × 11/12 = 916.666,67', () => {
    expect(dppNilaiLain('1000000').toFixed(2)).toBe('916666.67');
  });

  it('balanced: dppNilaiLain × 12% = hitungPpn EFEKTIF_11', () => {
    const harga = '500000';
    const dpp = dppNilaiLain(harga);
    const ppn1 = dpp.mul(new Decimal(12).div(100)).toDecimalPlaces(2);
    const ppn2 = hitungPpn(harga, { tarif: 12, skema: 'EFEKTIF_11' });
    expect(ppn1.toFixed(2)).toBe(ppn2.toFixed(2));
  });
});

describe('hitungPph23 — UU PPh Pasal 23', () => {
  it('Jasa 2% dengan NPWP: 10jt × 2% = 200rb', () => {
    const pph = hitungPph23('10000000', { tarif: 2, penerimaPunyaNpwp: true });
    expect(pph.toFixed(2)).toBe('200000.00');
  });

  it('Tanpa NPWP: surcharge 100% → 2% jadi 4%', () => {
    const pph = hitungPph23('10000000', { tarif: 2, penerimaPunyaNpwp: false });
    expect(pph.toFixed(2)).toBe('400000.00');
  });

  it('Royalti 15% dengan NPWP', () => {
    const pph = hitungPph23('5000000', { tarif: 15, penerimaPunyaNpwp: true });
    expect(pph.toFixed(2)).toBe('750000.00');
  });

  it('Royalti 15% tanpa NPWP → 30%', () => {
    const pph = hitungPph23('5000000', { tarif: 15, penerimaPunyaNpwp: false });
    expect(pph.toFixed(2)).toBe('1500000.00');
  });
});

describe('hitungPph4Ayat2 — final tax', () => {
  it('Sewa tanah/bangunan 10%', () => {
    expect(hitungPph4Ayat2('20000000', 10).toFixed(2)).toBe('2000000.00');
  });

  it('Jasa konstruksi 2%', () => {
    expect(hitungPph4Ayat2('100000000', 2).toFixed(2)).toBe('2000000.00');
  });
});

describe('hitungPphBadan — UU HPP', () => {
  it('Default 22% (UU HPP)', () => {
    expect(hitungPphBadan('500000000').toFixed(2)).toBe('110000000.00');
  });

  it('UMKM final 0,5% (PP 55/2022)', () => {
    expect(hitungPphUmkmFinal('1000000000').toFixed(2)).toBe('5000000.00');
  });
});

describe('sumMoney — Decimal precision', () => {
  it('hindari floating-point error: 0.1 + 0.2 = 0.3 (BUKAN 0.30000000000000004)', () => {
    const total = sumMoney(['0.1', '0.2']);
    expect(total.toFixed(2)).toBe('0.30');
  });

  it('jumlah besar tidak hilang precision', () => {
    const total = sumMoney(['999999999.99', '0.01']);
    expect(total.toFixed(2)).toBe('1000000000.00');
  });

  it('mixed input types (string + number + Decimal)', () => {
    const total = sumMoney(['100', 200, new Decimal('300.50')]);
    expect(total.toFixed(2)).toBe('600.50');
  });
});

describe('formatRp / formatPlain (id-ID locale)', () => {
  it('formatRp: 1234567 → "Rp 1.234.567"', () => {
    expect(formatRp(1234567)).toBe('Rp 1.234.567');
  });

  it('formatPlain: 1000000 → "1.000.000"', () => {
    expect(formatPlain(1000000)).toBe('1.000.000');
  });

  it('rounding ke satuan rupiah (no decimal default)', () => {
    expect(formatRp(1234.56)).toBe('Rp 1.235');
  });

  it('withDecimal=true tampilkan koma dua angka', () => {
    expect(formatRp(1234.5, true)).toBe('Rp 1.234,50');
  });
});
