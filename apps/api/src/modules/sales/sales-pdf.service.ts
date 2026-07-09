import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces.js';
import { PdfService } from '../../common/pdf/pdf.service.js';

interface SalesLine {
  no: number;
  deskripsi: string;
  qty: string | { toString(): string };
  satuan: string;
  hargaSatuan: string | { toString(): string };
  diskonPersen: string | { toString(): string };
  dpp: string | { toString(): string };
  ppn: string | { toString(): string };
  item?: { kode: string } | null;
}
interface SalesDoc {
  nomor: string | null;
  tanggal: Date | string;
  jatuhTempo: Date | string;
  termin: string;
  status: string;
  deskripsi: string | null;
  customer: { kode: string; nama: string; npwp: string | null; isPkp: boolean; alamat: string | null };
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  totalDpp: string | { toString(): string };
  totalPpn: string | { toString(): string };
  totalDiskon: string | { toString(): string };
  totalNetto: string | { toString(): string };
  totalDibayar: string | { toString(): string };
  lines: SalesLine[];
}

@Injectable()
export class SalesPdfService {
  constructor(private readonly pdf: PdfService) {}

  build(s: SalesDoc, tenantNama: string, logoDataUri?: string | null): Promise<Buffer> {
    const sisa = Number(s.totalNetto.toString()) - Number(s.totalDibayar.toString());
    const body: TableCell[][] = [
      [
        { text: '#', bold: true, fontSize: 9 },
        { text: 'Deskripsi', bold: true, fontSize: 9 },
        { text: 'Qty', bold: true, fontSize: 9, alignment: 'right' },
        { text: 'Satuan', bold: true, fontSize: 9 },
        { text: 'Harga', bold: true, fontSize: 9, alignment: 'right' },
        { text: 'DPP', bold: true, fontSize: 9, alignment: 'right' },
        { text: 'PPN', bold: true, fontSize: 9, alignment: 'right' },
      ],
      ...s.lines.map((l): TableCell[] => [
        { text: String(l.no), fontSize: 9 },
        { text: (l.item?.kode ? `[${l.item.kode}] ` : '') + l.deskripsi, fontSize: 9 },
        { text: l.qty.toString(), alignment: 'right', fontSize: 9 },
        { text: l.satuan, fontSize: 9 },
        { text: this.pdf.formatRp(l.hargaSatuan.toString()), alignment: 'right', fontSize: 9 },
        { text: this.pdf.formatRp(l.dpp.toString()), alignment: 'right', fontSize: 9 },
        { text: this.pdf.formatRp(l.ppn.toString()), alignment: 'right', fontSize: 9 },
      ]),
    ];

    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        ...(logoDataUri ? [{ image: logoDataUri, fit: [130, 40] as [number, number], alignment: 'center' as const, margin: [0, 0, 0, 4] as [number, number, number, number] }] : []),
        { text: tenantNama, bold: true, fontSize: 12, alignment: 'center' },
        { text: 'FAKTUR PENJUALAN', bold: true, fontSize: 16, alignment: 'center', margin: [0, 4, 0, 8] },
        {
          columns: [
            {
              stack: [
                { text: 'Kepada Yth:', fontSize: 9, color: '#666' },
                { text: s.customer.nama, bold: true, fontSize: 10 },
                { text: `Kode: ${s.customer.kode}${s.customer.isPkp ? ' (PKP)' : ''}`, fontSize: 9 },
                s.customer.npwp ? { text: `NPWP: ${s.customer.npwp}`, fontSize: 9 } : { text: '' },
                s.customer.alamat ? { text: s.customer.alamat, fontSize: 9, color: '#444' } : { text: '' },
              ],
            },
            {
              stack: [
                { text: ['Nomor: ', { text: s.nomor ?? '— DRAFT —', bold: true }] },
                { text: ['Tanggal: ', { text: this.pdf.formatTanggal(s.tanggal) }] },
                { text: ['Jatuh Tempo: ', { text: this.pdf.formatTanggal(s.jatuhTempo) }] },
                { text: ['Cabang: ', { text: s.cabang.kode }] },
                { text: ['Termin: ', { text: s.termin }] },
                { text: ['Status: ', { text: s.status, bold: true }] },
              ],
              fontSize: 9, alignment: 'right',
            },
          ],
          columnGap: 20, margin: [0, 0, 0, 12],
        },
        {
          table: { widths: [16, '*', 36, 36, 60, 70, 60], headerRows: 1, body },
          layout: 'lightHorizontalLines',
        },
        {
          columns: [
            s.deskripsi ? { text: 'Keterangan: ' + s.deskripsi, fontSize: 9, italics: true } : { text: '' },
            {
              width: 220,
              table: {
                widths: ['*', 100],
                body: [
                  [{ text: 'DPP' }, { text: this.pdf.formatRp(s.totalDpp.toString()), alignment: 'right' }],
                  [{ text: 'PPN' }, { text: this.pdf.formatRp(s.totalPpn.toString()), alignment: 'right' }],
                  [{ text: 'Diskon' }, { text: this.pdf.formatRp(s.totalDiskon.toString()), alignment: 'right' }],
                  [{ text: 'Total Netto', bold: true }, { text: this.pdf.formatRp(s.totalNetto.toString()), alignment: 'right', bold: true }],
                  [{ text: 'Dibayar' }, { text: this.pdf.formatRp(s.totalDibayar.toString()), alignment: 'right' }],
                  [{ text: 'Sisa', bold: true, color: sisa > 0 ? '#b00' : '#060' }, { text: this.pdf.formatRp(sisa), alignment: 'right', bold: true, color: sisa > 0 ? '#b00' : '#060' }],
                ],
              },
              layout: 'lightHorizontalLines',
              fontSize: 9,
            },
          ],
          margin: [0, 12, 0, 0],
        },
      ],
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }
}
