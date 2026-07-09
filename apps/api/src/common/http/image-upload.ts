import { BadRequestException } from '@nestjs/common';
import type { RequestWithFile } from './multipart.js';

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB — logo, bukan dokumen besar.

interface ImageFormat {
  ext: string;
  magic: number[];
  /** Cek tambahan untuk format container (mis. WEBP butuh "WEBP" di offset 8). */
  extraCheck?: (buffer: Buffer) => boolean;
}

const FORMATS: ImageFormat[] = [
  { ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  { ext: '.jpeg', magic: [0xff, 0xd8, 0xff] },
  {
    ext: '.webp',
    magic: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    extraCheck: (buffer) => buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

function matchesMagic(buffer: Buffer, format: ImageFormat): boolean {
  if (buffer.length < format.magic.length) return false;
  const head = buffer.subarray(0, format.magic.length);
  if (!format.magic.every((b, i) => head[i] === b)) return false;
  return format.extraCheck ? format.extraCheck(buffer) : true;
}

/** Cek magic bytes buffer terhadap ekstensi klaim (`.png`/`.jpg`/`.jpeg`/`.webp`). */
export function isImageMagicBytesValid(buffer: Buffer, ext: string): boolean {
  const format = FORMATS.find((f) => f.ext === ext.toLowerCase());
  if (!format) return false;
  return matchesMagic(buffer, format);
}

export const MAX_LOGO_UPLOAD_BYTES = MAX_LOGO_BYTES;

/**
 * Pull single image (PNG/JPEG/WEBP) Buffer dari multipart request untuk
 * logo perusahaan. Nama file cuma metadata dari client, gampang dipalsukan
 * — cek signature asli (magic bytes), bukan cuma ekstensi, sama pola seperti
 * `readXlsxUpload`.
 */
export async function readImageUpload(req: RequestWithFile): Promise<{ buffer: Buffer; ext: string }> {
  if (!req.isMultipart()) {
    throw new BadRequestException('Request harus multipart/form-data');
  }
  const file = await req.file();
  if (!file) throw new BadRequestException('Tidak ada file di-upload');

  const fn = file.filename.toLowerCase();
  const candidate = FORMATS.find((f) => fn.endsWith(f.ext));
  if (!candidate) {
    throw new BadRequestException('Hanya file .png, .jpg, .jpeg, atau .webp yang didukung');
  }

  const buffer = await file.toBuffer();
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new BadRequestException('Ukuran logo maksimal 2 MB');
  }
  if (!matchesMagic(buffer, candidate)) {
    throw new BadRequestException('File bukan gambar valid (signature tidak cocok dengan ekstensi)');
  }

  return { buffer, ext: candidate.ext };
}
