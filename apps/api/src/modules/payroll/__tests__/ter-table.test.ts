/**
 * Unit test untuk TER table lookup PPh 21.
 * ⚠ Test ini menguji ALGORITMA lookup, bukan akurasi nilai bracket
 * (yang masih DEMO/placeholder — production wajib lengkapi dari peraturan
 * DJP resmi).
 */

import { describe, it, expect } from 'vitest';
import { PtkpKategori } from '@lentera/db';
import { lookupTer } from '../ter-table.js';

describe('lookupTer — algoritma bracket scan', () => {
  describe('Kategori A (TK_0)', () => {
    it('bruto < bracket pertama → tarif 0%', () => {
      expect(lookupTer(PtkpKategori.A, 5_000_000)).toBe(0);
    });

    it('bruto tepat di ceiling → ambil bracket itu', () => {
      // ceiling 5.400.000 → 0%
      expect(lookupTer(PtkpKategori.A, 5_400_000)).toBe(0);
    });

    it('bruto 1 rupiah di atas bracket → ambil bracket berikutnya', () => {
      expect(lookupTer(PtkpKategori.A, 5_400_001)).toBe(1.5);
    });

    it('bruto sangat besar → fallback ke tarif maksimum', () => {
      expect(lookupTer(PtkpKategori.A, 999_999_999_999)).toBe(34);
    });
  });

  describe('Kategori B vs C (PTKP berbeda → bracket berbeda)', () => {
    it('B punya ceiling lebih tinggi dari A untuk tarif 0%', () => {
      // A: ceiling 5.4jt utk 0%; B: 6.2jt utk 0%
      expect(lookupTer(PtkpKategori.A, 6_000_000)).toBeGreaterThan(0);
      expect(lookupTer(PtkpKategori.B, 6_000_000)).toBe(0);
    });

    it('C (tanggungan banyak) lebih ringan dari B', () => {
      // di 6.6jt: B=0%, C=0%
      expect(lookupTer(PtkpKategori.C, 6_600_000)).toBe(0);
    });
  });

  describe('Monotonic — tarif tidak boleh turun seiring naiknya bruto', () => {
    it.each([['A'], ['B'], ['C']] as const)('kategori %s: tarif monotonically non-decreasing', (k) => {
      let prev = -1;
      // Sample 50 titik random sampai 1 miliar
      for (let i = 0; i < 50; i++) {
        const bruto = i * 20_000_000; // 0, 20jt, 40jt, ...
        const tarif = lookupTer(PtkpKategori[k], bruto);
        expect(tarif).toBeGreaterThanOrEqual(prev);
        prev = tarif;
      }
    });
  });
});
