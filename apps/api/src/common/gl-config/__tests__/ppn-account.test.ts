import { describe, it, expect } from 'vitest';
import { effectivePpnRate } from '../ppn-account.js';

describe('effectivePpnRate — deteksi tarif efektif dari total faktur', () => {
  it('faktur efektif 11% (PMK 131/2024)', () => {
    // DPP 1.000.000, PPN 110.000 → 11%
    expect(effectivePpnRate('1000000', '110000')).toBe(11);
  });

  it('faktur BKP mewah 12%', () => {
    // DPP 1.000.000, PPN 120.000 → 12%
    expect(effectivePpnRate('1000000', '120000')).toBe(12);
  });

  it('toleran terhadap noise pembulatan per-baris', () => {
    // 11% dengan sedikit selisih pembulatan tetap terbaca ~11
    expect(effectivePpnRate('999999', '110001')).toBe(11);
  });

  it('DPP nol / PPN nol → default aman 11', () => {
    expect(effectivePpnRate('0', '0')).toBe(11);
    expect(effectivePpnRate('1000000', '0')).toBe(11);
  });
});
