/**
 * Unit test untuk TER table lookup PPh 21 (PMK 168/2023).
 * Test menguji ALGORITMA lookup + spot-check nilai bracket.
 * Kalau bracket resmi berubah (revisi PMK), update angka di sini.
 */

import { describe, it, expect } from 'vitest';
import { PtkpKategori } from '@lentera/db';
import { lookupTer } from '../ter-table.js';

describe('lookupTer — PMK 168/2023 bracket', () => {
  describe('Kategori A (TK/0, TK/1, K/0)', () => {
    it('bruto ≤ 5.400.000 → 0%', () => {
      expect(lookupTer(PtkpKategori.A, 5_400_000)).toBe(0);
      expect(lookupTer(PtkpKategori.A, 3_000_000)).toBe(0);
    });

    it('bruto 5.400.001 → 0.25%', () => {
      expect(lookupTer(PtkpKategori.A, 5_400_001)).toBe(0.25);
    });

    it('bruto 6.000.000 (bracket 3: 5.65-5.95 = 0.5%) → 0.75% (bracket 4: 5.95-6.3)', () => {
      expect(lookupTer(PtkpKategori.A, 6_000_000)).toBe(0.75);
    });

    it('gaji entry-level 8jt → 1.5%', () => {
      expect(lookupTer(PtkpKategori.A, 8_000_000)).toBe(1.5);
    });

    it('gaji supervisor 15jt → 6%', () => {
      expect(lookupTer(PtkpKategori.A, 15_000_000)).toBe(6);
    });

    it('gaji manager 30jt → 12%', () => {
      expect(lookupTer(PtkpKategori.A, 30_000_000)).toBe(12);
    });

    it('director 100jt → 24% (bracket 89-103jt)', () => {
      expect(lookupTer(PtkpKategori.A, 100_000_000)).toBe(24);
    });

    it('bruto sangat besar → 34% (maksimum)', () => {
      expect(lookupTer(PtkpKategori.A, 999_999_999_999)).toBe(34);
    });
  });

  describe('Kategori B (TK/2, TK/3, K/1, K/2)', () => {
    it('bruto ≤ 6.200.000 → 0%', () => {
      expect(lookupTer(PtkpKategori.B, 6_200_000)).toBe(0);
    });

    it('bruto 6.200.001 → 0.25%', () => {
      expect(lookupTer(PtkpKategori.B, 6_200_001)).toBe(0.25);
    });

    it('gaji 15jt → 6%', () => {
      // Bracket B: 14.95jt-16.4jt = 6%
      expect(lookupTer(PtkpKategori.B, 15_000_000)).toBe(6);
    });

    it('C (PTKP tertinggi) memberi tarif 0% lebih tinggi ceiling-nya', () => {
      // Di 6.5jt: A > 0, B > 0, C = 0
      expect(lookupTer(PtkpKategori.A, 6_500_000)).toBeGreaterThan(0);
      expect(lookupTer(PtkpKategori.B, 6_500_000)).toBeGreaterThan(0);
      expect(lookupTer(PtkpKategori.C, 6_500_000)).toBe(0);
    });
  });

  describe('Kategori C (K/3)', () => {
    it('bruto ≤ 6.600.000 → 0%', () => {
      expect(lookupTer(PtkpKategori.C, 6_600_000)).toBe(0);
    });

    it('bruto 6.600.001 → 0.25%', () => {
      expect(lookupTer(PtkpKategori.C, 6_600_001)).toBe(0.25);
    });

    it('gaji 20jt → 7% (bracket 19.5-22.7jt)', () => {
      expect(lookupTer(PtkpKategori.C, 20_000_000)).toBe(7);
    });

    it('bruto sangat besar → 34% (cap terkonfirmasi 34%)', () => {
      expect(lookupTer(PtkpKategori.C, 999_999_999_999)).toBe(34);
    });
  });

  describe('Monotonic — tarif tidak boleh turun seiring naiknya bruto', () => {
    it.each([['A'], ['B'], ['C']] as const)('kategori %s monotonically non-decreasing', (k) => {
      let prev = -1;
      // Sample 100 titik dari 0 sampai 1.5 miliar
      for (let i = 0; i <= 100; i++) {
        const bruto = i * 15_000_000; // 0, 15jt, 30jt, ..., 1.5M
        const tarif = lookupTer(PtkpKategori[k], bruto);
        expect(tarif).toBeGreaterThanOrEqual(prev);
        prev = tarif;
      }
    });
  });

  describe('Cross-category — kategori dengan PTKP lebih tinggi umumnya ringan', () => {
    it('untuk bruto sama, C ≤ B ≤ A (semakin banyak tanggungan, semakin ringan)', () => {
      const testBruto = [7_000_000, 10_000_000, 20_000_000, 50_000_000];
      for (const bruto of testBruto) {
        const a = lookupTer(PtkpKategori.A, bruto);
        const b = lookupTer(PtkpKategori.B, bruto);
        const c = lookupTer(PtkpKategori.C, bruto);
        expect(c).toBeLessThanOrEqual(b);
        expect(b).toBeLessThanOrEqual(a);
      }
    });
  });
});
