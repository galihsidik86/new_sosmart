import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces.js';
import { PdfService } from '../../common/pdf/pdf.service.js';

interface JurnalLine {
  no: number;
  debit: string | { toString(): string };
  kredit: string | { toString(): string };
  deskripsi: string | null;
  account: { kode: string; nama: string };
}
interface JurnalDoc {
  id: string;
  nomor: string | null;
  tanggal: Date | string;
  deskripsi: string;
  sumber: string;
  status: string;
  totalDebit: string | { toString(): string };
  totalKredit: string | { toString(): string };
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  lines: JurnalLine[];
}

@Injectable()
export class JournalPdfService {
  constructor(private readonly pdf: PdfService) {}

  build(j: JurnalDoc, tenantNama: string): Promise<Buffer> {
    const body: TableCell[][] = [
      [
        { text: 'No', bold: true, fontSize: 9 },
        { text: 'Akun', bold: true, fontSize: 9 },
        { text: 'Keterangan', bold: true, fontSize: 9 },
        { text: 'Debit', bold: true, fontSize: 9, alignment: 'right' },
        { text: 'Kredit', bold: true, fontSize: 9, alignment: 'right' },
      ],
      ...j.lines.map((l): TableCell[] => [
        { text: String(l.no), fontSize: 9 },
        { text: `${l.account.kode}  ${l.account.nama}`, fontSize: 9 },
        { text: l.deskripsi ?? '', fontSize: 9 },
        { text: Number(l.debit.toString()) > 0 ? this.pdf.formatRp(l.debit.toString()) : '', alignment: 'right', fontSize: 9 },
        { text: Number(l.kredit.toString()) > 0 ? this.pdf.formatRp(l.kredit.toString()) : '', alignment: 'right', fontSize: 9 },
      ]),
      [
        { text: 'TOTAL', colSpan: 3, bold: true, alignment: 'right' as const }, '', '',
        { text: this.pdf.formatRp(j.totalDebit.toString()), bold: true, alignment: 'right' as const },
        { text: this.pdf.formatRp(j.totalKredit.toString()), bold: true, alignment: 'right' as const },
      ],
    ];

    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 60, 40],
      content: [
        { text: tenantNama, bold: true, fontSize: 12, alignment: 'center' },
        { text: 'JURNAL UMUM', bold: true, fontSize: 16, alignment: 'center', margin: [0, 4, 0, 8] },
        {
          columns: [
            {
              stack: [
                { text: ['Nomor: ', { text: j.nomor ?? '— DRAFT —', bold: true }] },
                { text: ['Tanggal: ', { text: this.pdf.formatTanggal(j.tanggal) }] },
                { text: ['Cabang: ', { text: j.cabang.kode + ' — ' + j.cabang.nama }] },
              ],
              fontSize: 9,
            },
            {
              stack: [
                { text: ['Periode: ', { text: j.fiscalPeriod.label }] },
                { text: ['Sumber: ', { text: j.sumber }] },
                { text: ['Status: ', { text: j.status, bold: true }] },
              ],
              fontSize: 9, alignment: 'right',
            },
          ],
          margin: [0, 0, 0, 6],
        },
        { text: j.deskripsi, italics: true, fontSize: 10, margin: [0, 0, 0, 8] },
        {
          table: { widths: [24, 140, '*', 80, 80], headerRows: 1, body },
          layout: 'lightHorizontalLines',
        },
      ],
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }
}
