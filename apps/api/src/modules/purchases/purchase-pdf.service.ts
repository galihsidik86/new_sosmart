import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces.js';
import { PdfService } from '../../common/pdf/pdf.service.js';

interface PurchLine {
  no: number;
  deskripsi: string;
  qty: string | { toString(): string };
  satuan: string;
  hargaSatuan: string | { toString(): string };
  dpp: string | { toString(): string };
  ppn: string | { toString(): string };
  pph23: string | { toString(): string };
  item?: { kode: string } | null;
}
interface PurchDoc {
  nomor: string | null;
  nomorVendor: string | null;
  tanggal: Date | string;
  jatuhTempo: Date | string;
  termin: string;
  status: string;
  deskripsi: string | null;
  vendor: { kode: string; nama: string; npwp: string | null; isPkp: boolean; alamat: string | null };
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  totalDpp: string | { toString(): string };
  totalPpn: string | { toString(): string };
  totalPph23: string | { toString(): string };
  totalDiskon: string | { toString(): string };
  totalNetto: string | { toString(): string };
  totalDibayar: string | { toString(): string };
  lines: PurchLine[];
}

@Injectable()
export class PurchasePdfService {
  constructor(private readonly pdf: PdfService) {}

  build(p: PurchDoc, tenantNama: string): Promise<Buffer> {
    const sisa = Number(p.totalNetto.toString()) - Number(p.totalDibayar.toString());
    const body: TableCell[][] = [
      [
        { text: '#', bold: true, fontSize: 9 },
        { text: 'Deskripsi', bold: true, fontSize: 9 },
        { text: 'Qty', bold: true, fontSize: 9, alignment: 'right' },
        { text: 'Satuan', bold: true, fontSize: 9 },
        { text: 'Harga', bold: true, fontSize: 9, alignment: 'right' },
        { text: 'DPP', bold: true, fontSize: 9, alignment: 'right' },
        { text: 'PPN', bold: true, fontSize: 9, alignment: 'right' },
        { text: 'PPh 23', bold: true, fontSize: 9, alignment: 'right' },
      ],
      ...p.lines.map((l): TableCell[] => [
        { text: String(l.no), fontSize: 9 },
        { text: (l.item?.kode ? `[${l.item.kode}] ` : '') + l.deskripsi, fontSize: 9 },
        { text: l.qty.toString(), alignment: 'right', fontSize: 9 },
        { text: l.satuan, fontSize: 9 },
        { text: this.pdf.formatRp(l.hargaSatuan.toString()), alignment: 'right', fontSize: 9 },
        { text: this.pdf.formatRp(l.dpp.toString()), alignment: 'right', fontSize: 9 },
        { text: this.pdf.formatRp(l.ppn.toString()), alignment: 'right', fontSize: 9 },
        { text: this.pdf.formatRp(l.pph23.toString()), alignment: 'right', fontSize: 9 },
      ]),
    ];

    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        { text: tenantNama, bold: true, fontSize: 12, alignment: 'center' },
        { text: 'TAGIHAN PEMBELIAN', bold: true, fontSize: 16, alignment: 'center', margin: [0, 4, 0, 8] },
        {
          columns: [
            {
              stack: [
                { text: 'Dari Vendor:', fontSize: 9, color: '#666' },
                { text: p.vendor.nama, bold: true, fontSize: 10 },
                { text: `Kode: ${p.vendor.kode}${p.vendor.isPkp ? ' (PKP)' : ''}`, fontSize: 9 },
                p.vendor.npwp ? { text: `NPWP: ${p.vendor.npwp}`, fontSize: 9 } : { text: '' },
                p.vendor.alamat ? { text: p.vendor.alamat, fontSize: 9, color: '#444' } : { text: '' },
              ],
            },
            {
              stack: [
                { text: ['Nomor: ', { text: p.nomor ?? '— DRAFT —', bold: true }] },
                p.nomorVendor ? { text: ['Nomor Vendor: ', { text: p.nomorVendor }] } : { text: '' },
                { text: ['Tanggal: ', { text: this.pdf.formatTanggal(p.tanggal) }] },
                { text: ['Jatuh Tempo: ', { text: this.pdf.formatTanggal(p.jatuhTempo) }] },
                { text: ['Cabang: ', { text: p.cabang.kode }] },
                { text: ['Termin: ', { text: p.termin }] },
                { text: ['Status: ', { text: p.status, bold: true }] },
              ],
              fontSize: 9, alignment: 'right',
            },
          ],
          columnGap: 20, margin: [0, 0, 0, 12],
        },
        {
          table: { widths: [16, '*', 32, 32, 56, 60, 50, 50], headerRows: 1, body },
          layout: 'lightHorizontalLines',
        },
        {
          columns: [
            p.deskripsi ? { text: 'Keterangan: ' + p.deskripsi, fontSize: 9, italics: true } : { text: '' },
            {
              width: 220,
              table: {
                widths: ['*', 100],
                body: [
                  [{ text: 'DPP' }, { text: this.pdf.formatRp(p.totalDpp.toString()), alignment: 'right' }],
                  [{ text: 'PPN' }, { text: this.pdf.formatRp(p.totalPpn.toString()), alignment: 'right' }],
                  [{ text: 'PPh 23' }, { text: this.pdf.formatRp(p.totalPph23.toString()), alignment: 'right' }],
                  [{ text: 'Diskon' }, { text: this.pdf.formatRp(p.totalDiskon.toString()), alignment: 'right' }],
                  [{ text: 'Total Netto', bold: true }, { text: this.pdf.formatRp(p.totalNetto.toString()), alignment: 'right', bold: true }],
                  [{ text: 'Dibayar' }, { text: this.pdf.formatRp(p.totalDibayar.toString()), alignment: 'right' }],
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
