import { BadRequestException } from '@nestjs/common';

/**
 * Minimal subset of FastifyRequest yang dipakai untuk extract upload .xlsx.
 * Standalone interface hindari resolve issue ke `fastify` types entry.
 */
export interface RequestWithFile {
  isMultipart(): boolean;
  file(): Promise<MultipartFile | undefined>;
}

interface MultipartFile {
  filename: string;
  mimetype: string;
  toBuffer(): Promise<Buffer>;
}

/** Pull single .xlsx file Buffer dari multipart request. Throw kalau bukan xlsx. */
export async function readXlsxUpload(req: RequestWithFile): Promise<{ filename: string; buffer: Buffer }> {
  if (!req.isMultipart()) {
    throw new BadRequestException('Request harus multipart/form-data');
  }
  const file = await req.file();
  if (!file) throw new BadRequestException('Tidak ada file di-upload');

  const fn = file.filename.toLowerCase();
  if (!fn.endsWith('.xlsx')) {
    throw new BadRequestException('Hanya file .xlsx yang didukung');
  }
  const buffer = await file.toBuffer();
  if (!isXlsxMagicBytes(buffer)) {
    // Nama file cuma metadata dari client, gampang dipalsukan (rename .txt
    // jadi .xlsx). .xlsx sebenarnya container ZIP (Open Packaging Conventions)
    // — cek signature ZIP asli (PK\x03\x04) di 4 byte pertama sebelum masuk
    // parser, bukan cuma percaya nama file.
    throw new BadRequestException('File bukan .xlsx valid (signature tidak cocok)');
  }
  return { filename: file.filename, buffer };
}

/** Cek magic bytes ZIP (PK\x03\x04) — .xlsx adalah container ZIP (OPC). */
export function isXlsxMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/** Standard return shape untuk import endpoints. */
export interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}
