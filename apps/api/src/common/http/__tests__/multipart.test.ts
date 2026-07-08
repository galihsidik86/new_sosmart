/**
 * Unit test murni untuk cek magic-byte .xlsx (R5, EVALUASI.md).
 * Sebelumnya readXlsxUpload cuma cek ekstensi nama file (gampang dipalsukan,
 * mis. rename .txt jadi .xlsx) — sekarang juga verifikasi signature ZIP
 * (PK\x03\x04) di 4 byte pertama, karena .xlsx adalah container ZIP (OPC).
 */
import { describe, it, expect } from 'vitest';
import { isXlsxMagicBytes } from '../multipart.js';

describe('isXlsxMagicBytes', () => {
  it('buffer dengan signature ZIP (PK\\x03\\x04) di awal — valid', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    expect(isXlsxMagicBytes(buf)).toBe(true);
  });

  it('buffer text biasa (bukan ZIP) — ditolak walau nama file .xlsx', () => {
    const buf = Buffer.from('Kode,Nama,NIK,PTKP\n001,Test,123,TK_0\n', 'utf-8');
    expect(isXlsxMagicBytes(buf)).toBe(false);
  });

  it('buffer kosong — ditolak', () => {
    expect(isXlsxMagicBytes(Buffer.alloc(0))).toBe(false);
  });

  it('buffer terlalu pendek (<4 byte) — ditolak, bukan out-of-bounds error', () => {
    expect(isXlsxMagicBytes(Buffer.from([0x50, 0x4b]))).toBe(false);
  });

  it('buffer ZIP varian "empty archive" (PK\\x05\\x06) — TIDAK dianggap valid xlsx', () => {
    // Bukan signature yang exceljs/Excel hasilkan untuk .xlsx normal —
    // sengaja ketat ke PK\x03\x04 saja (local file header), bukan variasi ZIP lain.
    const buf = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00]);
    expect(isXlsxMagicBytes(buf)).toBe(false);
  });
});
