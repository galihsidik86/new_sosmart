import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces.js';
import { PdfService } from '../../common/pdf/pdf.service.js';
import type { LabaRugiResponse, LabaRugiAccount } from './laba-rugi.service.js';
import type { NeracaResponse } from './neraca.service.js';
import type { ArusKasResponse } from './arus-kas.service.js';
import type { PerubahanEkuitasResponse } from './perubahan-ekuitas.service.js';

/**
 * Render PDF untuk 4 laporan keuangan SAK ETAP.
 * Layout sederhana: header tenant + judul, body tabel, footer kecil.
 */
@Injectable()
export class ReportsPdfService {
  constructor(private readonly pdf: PdfService) {}

  private header(judul: string, periodeLabel: string, tenantNama: string): Content {
    return {
      stack: [
        { text: tenantNama, fontSize: 12, bold: true, alignment: 'center' },
        { text: judul, fontSize: 16, bold: true, alignment: 'center', margin: [0, 4, 0, 2] },
        { text: `Periode: ${periodeLabel}`, fontSize: 10, alignment: 'center', color: '#666' },
        { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 0.5, lineColor: '#999' }] },
      ],
      margin: [0, 0, 0, 12],
    };
  }

  private footer(): Content {
    return {
      text: `Dicetak ${new Date().toLocaleString('id-ID')}`,
      fontSize: 8, color: '#888', alignment: 'right',
      margin: [40, 0, 40, 0],
    };
  }

  private rowsTable(rows: LabaRugiAccount[], indent = 0): TableCell[][] {
    return rows.map((r) => [
      { text: ' '.repeat(indent) + r.kode, fontSize: 9 },
      { text: r.nama, fontSize: 9 },
      { text: this.pdf.formatRp(r.nilai), alignment: 'right', fontSize: 9 },
    ]);
  }

  buildLabaRugi(data: LabaRugiResponse, tenantNama: string): Promise<Buffer> {
    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        this.header('Laporan Laba Rugi', data.periode.label, tenantNama),

        { text: 'Pendapatan', bold: true, margin: [0, 6, 0, 2] },
        {
          table: {
            widths: [60, '*', 80],
            body: [
              ...this.rowsTable(data.pendapatan.rows),
              [{ text: 'Total Pendapatan', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.pendapatan.total), bold: true, alignment: 'right' }],
            ],
          },
          layout: 'lightHorizontalLines',
        },

        { text: 'Beban Pokok Penjualan', bold: true, margin: [0, 10, 0, 2] },
        {
          table: {
            widths: [60, '*', 80],
            body: [
              ...this.rowsTable(data.bebanPokok.rows),
              [{ text: 'Total HPP', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.bebanPokok.total), bold: true, alignment: 'right' }],
            ],
          },
          layout: 'lightHorizontalLines',
        },

        { columns: [{ text: 'LABA KOTOR', bold: true, fontSize: 11 }, { text: this.pdf.formatRp(data.labaKotor.nilai), alignment: 'right', bold: true, fontSize: 11 }], margin: [0, 8, 0, 8] },

        { text: 'Beban Operasi', bold: true, margin: [0, 6, 0, 2] },
        {
          table: {
            widths: [60, '*', 80],
            body: [
              ...this.rowsTable(data.bebanOperasi.rows),
              [{ text: 'Total Beban Operasi', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.bebanOperasi.total), bold: true, alignment: 'right' }],
            ],
          },
          layout: 'lightHorizontalLines',
        },

        { columns: [{ text: 'LABA USAHA', bold: true, fontSize: 11 }, { text: this.pdf.formatRp(data.labaUsaha.nilai), alignment: 'right', bold: true, fontSize: 11 }], margin: [0, 8, 0, 8] },

        ...(data.pendapatanLain.rows.length || data.bebanLain.rows.length ? [
          { text: 'Pendapatan & Beban Lain-lain', bold: true, margin: [0, 6, 0, 2] as [number, number, number, number] },
          {
            table: {
              widths: [60, '*', 80],
              body: [
                ...this.rowsTable(data.pendapatanLain.rows),
                ...this.rowsTable(data.bebanLain.rows),
              ],
            },
            layout: 'lightHorizontalLines',
          },
        ] : []),

        { columns: [{ text: 'LABA SEBELUM PAJAK', bold: true, fontSize: 11 }, { text: this.pdf.formatRp(data.labaSebelumPajak.nilai), alignment: 'right', bold: true, fontSize: 11 }], margin: [0, 8, 0, 4] },
        { columns: [{ text: 'Beban PPh', fontSize: 10 }, { text: this.pdf.formatRp(data.bebanPajak.nilai), alignment: 'right', fontSize: 10 }], margin: [0, 0, 0, 4] },
        { columns: [{ text: 'LABA BERSIH', bold: true, fontSize: 12 }, { text: this.pdf.formatRp(data.labaBersih.nilai), alignment: 'right', bold: true, fontSize: 12 }], margin: [0, 4, 0, 0] },
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }

  buildNeraca(data: NeracaResponse, tenantNama: string): Promise<Buffer> {
    const acctRows = (rows: { kode: string; nama: string; nilai: string }[]) =>
      rows.map((r): TableCell[] => [
        { text: r.kode, fontSize: 9 },
        { text: r.nama, fontSize: 9 },
        { text: this.pdf.formatRp(r.nilai), alignment: 'right', fontSize: 9 },
      ]);

    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        this.header('Neraca', data.periode.label, tenantNama),

        { text: 'ASET', bold: true, fontSize: 12, margin: [0, 4, 0, 4] },
        { text: 'Aset Lancar', bold: true, margin: [0, 0, 0, 2] },
        { table: { widths: [60, '*', 80], body: [
          ...acctRows(data.asetLancar.rows),
          [{ text: 'Total Aset Lancar', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.asetLancar.total), alignment: 'right', bold: true }],
        ] }, layout: 'lightHorizontalLines' },

        { text: 'Aset Tetap', bold: true, margin: [0, 8, 0, 2] },
        { table: { widths: [60, '*', 80], body: [
          ...acctRows(data.asetTetap.rows),
          [{ text: 'Total Aset Tetap', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.asetTetap.total), alignment: 'right', bold: true }],
        ] }, layout: 'lightHorizontalLines' },

        { columns: [{ text: 'TOTAL ASET', bold: true, fontSize: 11 }, { text: this.pdf.formatRp(data.totalAset.nilai), alignment: 'right', bold: true, fontSize: 11 }], margin: [0, 8, 0, 14] },

        { text: 'LIABILITAS & EKUITAS', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
        { text: 'Liabilitas Jangka Pendek', bold: true, margin: [0, 0, 0, 2] },
        { table: { widths: [60, '*', 80], body: [
          ...acctRows(data.liabilitasJangkaPendek.rows),
          [{ text: 'Total Liab. Pendek', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.liabilitasJangkaPendek.total), alignment: 'right', bold: true }],
        ] }, layout: 'lightHorizontalLines' },

        { text: 'Liabilitas Jangka Panjang', bold: true, margin: [0, 8, 0, 2] },
        { table: { widths: [60, '*', 80], body: [
          ...acctRows(data.liabilitasJangkaPanjang.rows),
          [{ text: 'Total Liab. Panjang', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.liabilitasJangkaPanjang.total), alignment: 'right', bold: true }],
        ] }, layout: 'lightHorizontalLines' },

        { text: 'Ekuitas', bold: true, margin: [0, 8, 0, 2] },
        { table: { widths: [60, '*', 80], body: [
          ...acctRows(data.ekuitas.rows),
          [{ text: 'Laba Berjalan Tahun Buku', bold: false, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.labaBerjalan.nilai), alignment: 'right' }],
          [{ text: 'Total Ekuitas', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.ekuitas.total), alignment: 'right', bold: true }],
        ] }, layout: 'lightHorizontalLines' },

        { columns: [{ text: 'TOTAL LIABILITAS + EKUITAS', bold: true, fontSize: 11 }, { text: this.pdf.formatRp(data.totalLiabilitasEkuitas.nilai), alignment: 'right', bold: true, fontSize: 11 }], margin: [0, 8, 0, 0] },

        { text: data.balanced ? '✓ Neraca seimbang.' : `⚠ Selisih: ${this.pdf.formatRp(data.selisih)}`, italics: true, color: data.balanced ? '#666' : '#a40', fontSize: 9, margin: [0, 8, 0, 0] },
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }

  buildArusKas(data: ArusKasResponse, tenantNama: string): Promise<Buffer> {
    const rowsTable = (rows: { label: string; nilai: string }[]) =>
      rows.map((r): TableCell[] => [
        { text: r.label, fontSize: 9 },
        { text: this.pdf.formatRp(r.nilai), alignment: 'right', fontSize: 9 },
      ]);
    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        this.header('Laporan Arus Kas — Metode Tidak Langsung', data.periode.label, tenantNama),

        { text: 'Arus Kas dari Aktivitas Operasi', bold: true, margin: [0, 4, 0, 2] },
        { table: { widths: ['*', 100], body: [
          ...rowsTable(data.operasi.rows),
          [{ text: 'Arus Kas Bersih Operasi', bold: true }, { text: this.pdf.formatRp(data.operasi.total), alignment: 'right', bold: true }],
        ] }, layout: 'lightHorizontalLines' },

        { text: 'Arus Kas dari Aktivitas Investasi', bold: true, margin: [0, 10, 0, 2] },
        { table: { widths: ['*', 100], body: [
          ...rowsTable(data.investasi.rows),
          [{ text: 'Arus Kas Bersih Investasi', bold: true }, { text: this.pdf.formatRp(data.investasi.total), alignment: 'right', bold: true }],
        ] }, layout: 'lightHorizontalLines' },

        { text: 'Arus Kas dari Aktivitas Pendanaan', bold: true, margin: [0, 10, 0, 2] },
        { table: { widths: ['*', 100], body: [
          ...rowsTable(data.pendanaan.rows),
          [{ text: 'Arus Kas Bersih Pendanaan', bold: true }, { text: this.pdf.formatRp(data.pendanaan.total), alignment: 'right', bold: true }],
        ] }, layout: 'lightHorizontalLines' },

        { columns: [{ text: 'Kenaikan/(Penurunan) Bersih Kas', bold: true }, { text: this.pdf.formatRp(data.kenaikanKasBersih), alignment: 'right', bold: true }], margin: [0, 10, 0, 4] },
        { columns: [{ text: 'Kas Awal Periode' }, { text: this.pdf.formatRp(data.kasAwal), alignment: 'right' }], margin: [0, 0, 0, 4] },
        { columns: [{ text: 'Kas Akhir Periode', bold: true, fontSize: 11 }, { text: this.pdf.formatRp(data.kasAkhir), alignment: 'right', bold: true, fontSize: 11 }], margin: [0, 4, 0, 0] },
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }

  buildPerubahanEkuitas(data: PerubahanEkuitasResponse, tenantNama: string): Promise<Buffer> {
    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        this.header('Laporan Perubahan Ekuitas', data.periode.label, tenantNama),
        { table: { widths: ['*', 100], body: [
          [{ text: 'Saldo Awal Modal Disetor' }, { text: this.pdf.formatRp(data.saldoAwal.modal), alignment: 'right' }],
          [{ text: '+ Tambahan Modal' }, { text: this.pdf.formatRp(data.tambahanModal), alignment: 'right' }],
          [{ text: 'Saldo Akhir Modal Disetor', bold: true }, { text: this.pdf.formatRp(data.saldoAkhir.modal), alignment: 'right', bold: true }],
          [{ text: '' }, { text: '' }],
          [{ text: 'Saldo Awal Saldo Laba' }, { text: this.pdf.formatRp(data.saldoAwal.saldoLaba), alignment: 'right' }],
          [{ text: '+ Laba Bersih Periode' }, { text: this.pdf.formatRp(data.labaBersih), alignment: 'right' }],
          [{ text: '− Dividen' }, { text: this.pdf.formatRp(data.dividen), alignment: 'right' }],
          [{ text: 'Saldo Akhir Saldo Laba', bold: true }, { text: this.pdf.formatRp(data.saldoAkhir.saldoLaba), alignment: 'right', bold: true }],
          [{ text: '' }, { text: '' }],
          [{ text: 'TOTAL EKUITAS', bold: true, fontSize: 11 }, { text: this.pdf.formatRp(data.saldoAkhir.total), alignment: 'right', bold: true, fontSize: 11 }],
        ] }, layout: 'lightHorizontalLines' },
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }
}
