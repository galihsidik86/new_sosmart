/**
 * Unit tests untuk validasi input faktur (salesLineInputSchema /
 * purchaseLineInputSchema).
 *
 * Regresi untuk bug: sebelum perbaikan, `lineMoney` menerima angka negatif
 * dan string non-numerik apa saja ("abc"), dan `diskonPersen` tidak punya
 * batas atas — diskon > 100% membuat DPP hasil hitung jadi negatif, yang
 * baru ketahuan saat Postgres menolak INSERT (CHECK kredit>=0) sebagai
 * error 500 mentah, bukan error validasi yang rapi.
 */

import { describe, it, expect } from 'vitest';
import { salesLineInputSchema, purchaseLineInputSchema } from '../schemas.js';

const validSalesLine = {
  deskripsi: 'Barang A',
  qty: '10',
  hargaSatuan: '1000',
  akunPendapatanId: '11111111-1111-1111-1111-111111111111',
};

describe('salesLineInputSchema — validasi nominal', () => {
  it('menerima line valid dengan diskon wajar', () => {
    const r = salesLineInputSchema.safeParse({ ...validSalesLine, diskonPersen: '10' });
    expect(r.success).toBe(true);
  });

  it('menolak qty negatif', () => {
    const r = salesLineInputSchema.safeParse({ ...validSalesLine, qty: -5 });
    expect(r.success).toBe(false);
  });

  it('menolak qty string non-numerik', () => {
    const r = salesLineInputSchema.safeParse({ ...validSalesLine, qty: 'abc' });
    expect(r.success).toBe(false);
  });

  it('menolak hargaSatuan negatif', () => {
    const r = salesLineInputSchema.safeParse({ ...validSalesLine, hargaSatuan: '-1000' });
    expect(r.success).toBe(false);
  });

  it('menolak diskonPersen > 100 (mencegah DPP negatif)', () => {
    const r = salesLineInputSchema.safeParse({ ...validSalesLine, diskonPersen: '150' });
    expect(r.success).toBe(false);
  });

  it('menerima diskonPersen = 100 (batas atas)', () => {
    const r = salesLineInputSchema.safeParse({ ...validSalesLine, diskonPersen: '100' });
    expect(r.success).toBe(true);
  });

  it('default diskonPersen = 0 kalau tidak diisi', () => {
    const r = salesLineInputSchema.parse(validSalesLine);
    expect(r.diskonPersen).toBe('0');
  });
});

describe('purchaseLineInputSchema — validasi nominal (sama dengan sales)', () => {
  const validPurchaseLine = {
    deskripsi: 'Barang A',
    qty: '10',
    hargaSatuan: '1000',
    akunDebitId: '11111111-1111-1111-1111-111111111111',
  };

  it('menolak diskonPersen > 100', () => {
    const r = purchaseLineInputSchema.safeParse({ ...validPurchaseLine, diskonPersen: '101' });
    expect(r.success).toBe(false);
  });

  it('menolak qty negatif', () => {
    const r = purchaseLineInputSchema.safeParse({ ...validPurchaseLine, qty: -1 });
    expect(r.success).toBe(false);
  });
});
