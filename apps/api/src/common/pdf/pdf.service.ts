import { createRequire } from 'node:module';
import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';

// pdfmake's Node-side `PdfPrinter` ships at `pdfmake/src/printer.js` as
// CommonJS — the package's main entry exports a different (HTML5-oriented)
// API. Load PdfPrinter directly via createRequire so it works under
// "type: module".
const require = createRequire(import.meta.url);
// Nama file sungguhan `Printer.js` (P besar) — kalau ditulis huruf kecil,
// jalan di Windows/macOS (case-insensitive filesystem) tapi gagal
// MODULE_NOT_FOUND di Linux (case-sensitive), termasuk di kebanyakan server produksi.
const printerModule = require('pdfmake/js/Printer.js');
const PdfPrinter = (printerModule.default ?? printerModule) as PrinterCtor;

interface UrlResolver {
  /** Register a URL to be fetched (queue). */
  resolve(url: string, headers?: Record<string, string>): unknown;
  /** Returns a Promise that resolves when all queued URLs are fetched. */
  resolved(): Promise<void>;
}

interface PrinterCtor {
  new (
    fonts: Record<string, Record<string, string>>,
    virtualfs?: unknown,
    urlResolver?: UrlResolver,
    localAccessPolicy?: unknown,
  ): {
    /** Async sejak pdfmake 0.3.x — kembali Promise<PDFKit doc> (stream-like). */
    createPdfKitDocument(def: TDocumentDefinitions): Promise<NodeJS.ReadableStream & { end(): void }>;
  };
}

/**
 * Wrapper untuk pdfmake. Pakai Helvetica built-in dari PDFKit (tidak perlu
 * file font terpisah). pdfmake mengizinkan style table deklaratif yang cocok
 * untuk laporan keuangan / faktur.
 */
@Injectable()
export class PdfService {
  private readonly printer: InstanceType<PrinterCtor>;

  constructor() {
    // pdfmake butuh font descriptor; standard Roboto sudah jadi default.
    const fonts = {
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    };
    // pdfmake 0.3.x butuh `urlResolver` walaupun kita pakai PDFKit standard
    // fonts (bukan URL fetch). Methods yang dipanggil: `resolve(url, headers)`
    // (queue) + `resolved()` (await all queued). Noop OK karena Helvetica/built-
    // in fonts tidak perlu di-fetch.
    const noopUrlResolver: UrlResolver = {
      resolve: () => undefined,
      resolved: () => Promise.resolve(),
    };
    this.printer = new PdfPrinter(fonts, undefined, noopUrlResolver);
  }

  /** Build PDF buffer dari pdfmake document definition. */
  async buildBuffer(def: TDocumentDefinitions): Promise<Buffer> {
    const doc = await this.printer.createPdfKitDocument(def);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  /** Currency Indonesia — rupiah bulat (tanpa desimal); desimal ditampilkan
   *  hanya bila memang ada sen, mis. "316.250.000,04". Lebih rapi untuk laporan. */
  formatRp(v: string | number): string {
    const n = typeof v === 'string' ? Number(v) : v;
    if (!isFinite(n)) return '0';
    const hasCents = Math.round(Math.abs(n) * 100) % 100 !== 0;
    return n.toLocaleString('id-ID', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  formatTanggal(d: Date | string): string {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}
