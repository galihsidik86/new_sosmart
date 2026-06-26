import { createRequire } from 'node:module';
import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';

// pdfmake's Node-side `PdfPrinter` ships as CommonJS only (printer.js) — no
// ESM entry and no proper type declarations for it. Load via createRequire so
// it works under "type: module" without bundler shenanigans.
const require = createRequire(import.meta.url);
const PdfPrinter = require('pdfmake') as unknown as PrinterCtor;

interface PrinterCtor {
  new (fonts: Record<string, Record<string, string>>): {
    createPdfKitDocument(def: TDocumentDefinitions): NodeJS.ReadableStream & {
      end(): void;
    };
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
    this.printer = new PdfPrinter(fonts);
  }

  /** Build PDF buffer dari pdfmake document definition. */
  buildBuffer(def: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = this.printer.createPdfKitDocument(def);
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  /** Currency Indonesia: 1.234.567,89 */
  formatRp(v: string | number): string {
    const n = typeof v === 'string' ? Number(v) : v;
    if (!isFinite(n)) return '0,00';
    return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatTanggal(d: Date | string): string {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}
