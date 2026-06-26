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
  return { filename: file.filename, buffer };
}

/** Standard return shape untuk import endpoints. */
export interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}
