/**
 * Unit test murni untuk cek magic-byte upload logo (PNG/JPEG/WEBP).
 * Nama file cuma metadata dari client, gampang dipalsukan (mis. rename .txt
 * jadi .png) — verifikasi signature biner asli, sama pola seperti
 * `isXlsxMagicBytes` di multipart.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { isImageMagicBytesValid } from '../image-upload.js';

describe('isImageMagicBytesValid', () => {
  it('PNG signature asli (89 50 4E 47 0D 0A 1A 0A) — valid utk .png', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(isImageMagicBytesValid(buf, '.png')).toBe(true);
  });

  it('JPEG signature asli (FF D8 FF) — valid utk .jpg dan .jpeg', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(isImageMagicBytesValid(buf, '.jpg')).toBe(true);
    expect(isImageMagicBytesValid(buf, '.jpeg')).toBe(true);
  });

  it('WEBP signature asli (RIFF....WEBP) — valid utk .webp', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // ukuran, tidak dicek
      Buffer.from('WEBP', 'ascii'),
    ]);
    expect(isImageMagicBytesValid(buf, '.webp')).toBe(true);
  });

  it('RIFF tanpa "WEBP" di offset 8 (mis. file .wav) — ditolak', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(isImageMagicBytesValid(buf, '.webp')).toBe(false);
  });

  it('teks biasa di-rename .png — ditolak walau ekstensi cocok', () => {
    const buf = Buffer.from('bukan gambar sama sekali', 'utf-8');
    expect(isImageMagicBytesValid(buf, '.png')).toBe(false);
  });

  it('buffer kosong — ditolak, bukan out-of-bounds error', () => {
    expect(isImageMagicBytesValid(Buffer.alloc(0), '.png')).toBe(false);
  });

  it('ekstensi tidak dikenal — ditolak', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isImageMagicBytesValid(buf, '.gif')).toBe(false);
  });
});
