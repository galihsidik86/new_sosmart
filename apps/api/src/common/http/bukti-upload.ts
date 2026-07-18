import { BadRequestException } from '@nestjs/common';

/**
 * Multipart request yang bisa mengeluarkan BEBERAPA file (async iterator),
 * dipakai upload bukti transaksi (PDF/gambar). Standalone interface supaya tak
 * bergantung entry types `fastify`.
 */
export interface RequestWithFiles {
  isMultipart(): boolean;
  files(): AsyncIterableIterator<MultipartFile>;
}

interface MultipartFile {
  filename: string;
  mimetype: string;
  toBuffer(): Promise<Buffer>;
}

interface Format {
  ext: string;
  magic: number[];
  extraCheck?: (buffer: Buffer) => boolean;
}

/** Format bukti yang didukung — PDF + gambar umum (nota/faktur/scan). */
const FORMATS: Format[] = [
  { ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  { ext: '.jpeg', magic: [0xff, 0xd8, 0xff] },
  {
    ext: '.webp',
    magic: [0x52, 0x49, 0x46, 0x46], // RIFF
    extraCheck: (b) => b.length >= 12 && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

const MAX_FILES = 15;

function matchesMagic(buffer: Buffer, fmt: Format): boolean {
  if (buffer.length < fmt.magic.length) return false;
  for (let i = 0; i < fmt.magic.length; i++) if (buffer[i] !== fmt.magic[i]) return false;
  return fmt.extraCheck ? fmt.extraCheck(buffer) : true;
}

export interface BuktiFile {
  filename: string;
  buffer: Buffer;
  ext: string;
}

/**
 * Ambil semua file bukti dari multipart request. Validasi ekstensi + magic
 * bytes (nama file gampang dipalsukan → cek signature asli, sama pola
 * `readImageUpload`/`readXlsxUpload`).
 */
export async function readBuktiUploads(req: RequestWithFiles): Promise<BuktiFile[]> {
  if (!req.isMultipart()) {
    throw new BadRequestException('Request harus multipart/form-data');
  }
  const out: BuktiFile[] = [];
  for await (const part of req.files()) {
    if (out.length >= MAX_FILES) {
      throw new BadRequestException(`Maksimal ${MAX_FILES} file per upload`);
    }
    const fn = (part.filename ?? '').toLowerCase();
    const fmt = FORMATS.find((f) => fn.endsWith(f.ext));
    if (!fmt) {
      throw new BadRequestException(
        `Tipe file "${part.filename}" tidak didukung — hanya PDF, PNG, JPG, atau WEBP`,
      );
    }
    let buffer: Buffer;
    try {
      buffer = await part.toBuffer();
    } catch {
      throw new BadRequestException(`File "${part.filename}" melebihi batas ukuran (maks 10 MB)`);
    }
    if (!matchesMagic(buffer, fmt)) {
      throw new BadRequestException(`File "${part.filename}" tidak valid (signature tidak cocok dengan ekstensi)`);
    }
    out.push({ filename: part.filename, buffer, ext: fmt.ext });
  }
  if (out.length === 0) {
    throw new BadRequestException('Tidak ada file di-upload');
  }
  return out;
}
