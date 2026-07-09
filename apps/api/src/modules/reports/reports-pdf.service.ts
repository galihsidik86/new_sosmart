import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces.js';
import { PdfService } from '../../common/pdf/pdf.service.js';
import type { LabaRugiResponse, LabaRugiAccount } from './laba-rugi.service.js';
import type { LabaRugiProyekResponse } from './laba-rugi-proyek.service.js';
import type { NeracaResponse } from './neraca.service.js';
import type { ArusKasResponse } from './arus-kas.service.js';
import type { PerubahanEkuitasResponse } from './perubahan-ekuitas.service.js';
import type { ArAgingResponse, ArStatementResponse } from './ar-aging.service.js';
import type { ApAgingResponse, ApStatementResponse } from './ap-aging.service.js';

/**
 * Render PDF untuk 4 laporan keuangan SAK ETAP.
 * Layout sederhana: header tenant + judul, body tabel, footer kecil.
 */
@Injectable()
export class ReportsPdfService {
  constructor(private readonly pdf: PdfService) {}

  private header(judul: string, periodeLabel: string, tenantNama: string, subtitle?: string): Content {
    const stack: Content[] = [
      { text: tenantNama, fontSize: 12, bold: true, alignment: 'center' },
      { text: judul, fontSize: 16, bold: true, alignment: 'center', margin: [0, 4, 0, 2] },
      { text: `Periode: ${periodeLabel}`, fontSize: 10, alignment: 'center', color: '#666' },
    ];
    if (subtitle) {
      stack.push({ text: subtitle, fontSize: 10, bold: true, alignment: 'center', color: '#333', margin: [0, 2, 0, 0] });
    }
    stack.push({ canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 0.5, lineColor: '#999' }] });
    return { stack, margin: [0, 0, 0, 12] };
  }

  /** Rangkai teks identitas filter proyek/cabang untuk sub-header cetak. */
  private filterSubtitle(filter?: LabaRugiResponse['filter']): string | undefined {
    if (!filter) return undefined;
    const parts: string[] = [];
    if (filter.project) {
      parts.push(`Proyek: ${filter.project.kode !== '-' ? filter.project.kode + ' — ' : ''}${filter.project.nama}`);
    }
    if (filter.cabang) {
      parts.push(`Cabang: ${filter.cabang.kode} — ${filter.cabang.nama}`);
    }
    return parts.length ? parts.join('   |   ') : undefined;
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

  /** Body isi Laba Rugi (tanpa header) — dipakai ulang oleh cetak per-proyek. */
  private labaRugiBody(data: LabaRugiResponse): Content[] {
    return [
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
      { text: 'Beban Pokok Jasa', bold: true, margin: [0, 10, 0, 2] },
      {
        table: {
          widths: [60, '*', 80],
          body: [
            ...this.rowsTable(data.bebanPokok.rows),
            [{ text: 'Total Beban Pokok', bold: true, colSpan: 2 }, {}, { text: this.pdf.formatRp(data.bebanPokok.total), bold: true, alignment: 'right' }],
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
          layout: 'lightHorizontalLines' as const,
        },
      ] : []),
      { columns: [{ text: 'LABA SEBELUM PAJAK', bold: true, fontSize: 11 }, { text: this.pdf.formatRp(data.labaSebelumPajak.nilai), alignment: 'right', bold: true, fontSize: 11 }], margin: [0, 8, 0, 4] },
      { columns: [{ text: 'Beban PPh', fontSize: 10 }, { text: this.pdf.formatRp(data.bebanPajak.nilai), alignment: 'right', fontSize: 10 }], margin: [0, 0, 0, 4] },
      { columns: [{ text: 'LABA BERSIH', bold: true, fontSize: 12 }, { text: this.pdf.formatRp(data.labaBersih.nilai), alignment: 'right', bold: true, fontSize: 12 }], margin: [0, 4, 0, 0] },
    ];
  }

  buildLabaRugi(data: LabaRugiResponse, tenantNama: string): Promise<Buffer> {
    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        this.header('Laporan Laba Rugi', data.periode.label, tenantNama, this.filterSubtitle(data.filter)),
        ...this.labaRugiBody(data),
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }

  /** Cetak batch: ringkasan semua proyek + detail Laba Rugi per proyek. */
  buildLabaRugiProyek(data: LabaRugiProyekResponse, tenantNama: string): Promise<Buffer> {
    const rp = (v: string) => this.pdf.formatRp(v);
    const hcell = (t: string, right = false): TableCell => ({ text: t, bold: true, fontSize: 9, alignment: right ? 'right' : 'left', fillColor: '#f3efe6' });
    const summary: TableCell[][] = [
      [hcell('Proyek'), hcell('Pendapatan', true), hcell('Beban Pokok', true), hcell('Beban Operasi', true), hcell('Laba Bersih', true), hcell('Margin', true)],
      ...data.rows.map((r): TableCell[] => [
        { text: `${r.project.kode} — ${r.project.nama}`, fontSize: 8 },
        { text: rp(r.pendapatan), alignment: 'right', fontSize: 8 },
        { text: rp(r.bebanPokok), alignment: 'right', fontSize: 8 },
        { text: rp(r.bebanOperasi), alignment: 'right', fontSize: 8 },
        { text: rp(r.labaBersih), alignment: 'right', fontSize: 8 },
        { text: `${r.marginPersen}%`, alignment: 'right', fontSize: 8 },
      ]),
      [
        { text: 'TOTAL SEMUA PROYEK', bold: true, fontSize: 9 },
        { text: rp(data.total.pendapatan), bold: true, alignment: 'right', fontSize: 9 },
        { text: rp(data.total.bebanPokok), bold: true, alignment: 'right', fontSize: 9 },
        { text: rp(data.total.bebanOperasi), bold: true, alignment: 'right', fontSize: 9 },
        { text: rp(data.total.labaBersih), bold: true, alignment: 'right', fontSize: 9 },
        { text: `${data.total.marginPersen}%`, bold: true, alignment: 'right', fontSize: 9 },
      ],
    ];
    const detail: Content[] = [];
    for (const r of data.rows) {
      detail.push({ text: `Proyek: ${r.project.kode} — ${r.project.nama}`, bold: true, fontSize: 12, pageBreak: 'before', margin: [0, 0, 0, 2] });
      detail.push({ text: `Status: ${r.project.status}`, fontSize: 9, color: '#666', margin: [0, 0, 0, 6] });
      detail.push(...this.labaRugiBody(r.detail));
    }
    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        this.header('Laporan Laba Rugi per Proyek', data.periode.label, tenantNama, `Ringkasan Semua Proyek (${data.rows.length})${data.ytd ? ' · YTD' : ''}`),
        { text: 'Ringkasan Laba Rugi per Proyek', bold: true, fontSize: 12, margin: [0, 4, 0, 4] },
        { table: { widths: ['*', 68, 68, 68, 68, 34], body: summary }, layout: 'lightHorizontalLines' },
        { text: 'Detail per proyek pada halaman berikut.', italics: true, fontSize: 9, color: '#666', margin: [0, 6, 0, 0] },
        ...detail,
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

  // -------- Fase G: Aging Piutang / Utang --------

  private agingHeader(judul: string, asOf: string, tenantNama: string): Content {
    return {
      stack: [
        { text: tenantNama, fontSize: 12, bold: true, alignment: 'center' },
        { text: judul, fontSize: 16, bold: true, alignment: 'center', margin: [0, 4, 0, 2] },
        { text: `Per tanggal: ${asOf}`, fontSize: 10, alignment: 'center', color: '#666' },
        { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 750, y2: 8, lineWidth: 0.5, lineColor: '#999' }] },
      ],
      margin: [0, 0, 0, 12],
    };
  }

  private agingSummaryTable(
    rows: Array<{ kode: string; nama: string; jumlahFaktur: number; buckets: { belumJatuh: string; b1_30: string; b31_60: string; b61_90: string; above90: string }; saldo: string }>,
    total: { belumJatuh: string; b1_30: string; b31_60: string; b61_90: string; above90: string; saldo: string },
    partyLabel: string,
  ): Content {
    const head: TableCell[] = [
      { text: partyLabel, bold: true, fontSize: 9, fillColor: '#F5F1E8' },
      { text: 'Fak', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: 'Belum JT', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: '1-30 hr', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: '31-60 hr', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: '61-90 hr', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: '> 90 hr', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: 'Saldo', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
    ];
    const body: TableCell[][] = [head];
    for (const r of rows) {
      body.push([
        { text: `${r.kode} — ${r.nama}`, fontSize: 8 },
        { text: String(r.jumlahFaktur), fontSize: 8, alignment: 'right' },
        { text: this.pdf.formatRp(r.buckets.belumJatuh), fontSize: 8, alignment: 'right' },
        { text: this.pdf.formatRp(r.buckets.b1_30), fontSize: 8, alignment: 'right' },
        { text: this.pdf.formatRp(r.buckets.b31_60), fontSize: 8, alignment: 'right' },
        { text: this.pdf.formatRp(r.buckets.b61_90), fontSize: 8, alignment: 'right' },
        { text: this.pdf.formatRp(r.buckets.above90), fontSize: 8, alignment: 'right' },
        { text: this.pdf.formatRp(r.saldo), fontSize: 8, alignment: 'right', bold: true },
      ]);
    }
    body.push([
      { text: 'TOTAL', bold: true, fontSize: 9, fillColor: '#F5F1E8' },
      { text: '', fillColor: '#F5F1E8' },
      { text: this.pdf.formatRp(total.belumJatuh), bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: this.pdf.formatRp(total.b1_30), bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: this.pdf.formatRp(total.b31_60), bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: this.pdf.formatRp(total.b61_90), bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: this.pdf.formatRp(total.above90), bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: this.pdf.formatRp(total.saldo), bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
    ]);
    return {
      table: {
        widths: ['*', 25, 65, 65, 65, 65, 65, 75],
        headerRows: 1,
        body,
      },
      layout: 'lightHorizontalLines',
    };
  }

  buildArAging(data: ArAgingResponse, tenantNama: string): Promise<Buffer> {
    const def: TDocumentDefinitions = {
      pageMargins: [30, 40, 30, 40],
      pageSize: 'A4',
      pageOrientation: 'landscape',
      content: [
        this.agingHeader('Aging Piutang Usaha', data.asOf, tenantNama),
        this.agingSummaryTable(
          data.rows,
          { ...data.totalBuckets, saldo: data.totalSaldo },
          'Pelanggan',
        ),
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }

  buildApAging(data: ApAgingResponse, tenantNama: string): Promise<Buffer> {
    const rowsMapped = data.rows.map((r) => ({
      kode: r.kode,
      nama: r.nama,
      jumlahFaktur: r.jumlahFaktur,
      buckets: r.buckets,
      saldo: r.saldo,
    }));
    const def: TDocumentDefinitions = {
      pageMargins: [30, 40, 30, 40],
      pageSize: 'A4',
      pageOrientation: 'landscape',
      content: [
        this.agingHeader('Aging Utang Usaha', data.asOf, tenantNama),
        this.agingSummaryTable(
          rowsMapped,
          { ...data.totalBuckets, saldo: data.totalSaldo },
          'Vendor',
        ),
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }

  private statementTable(
    invoices: Array<{
      nomor: string | null; tanggal: string; jatuhTempo: string;
      totalNetto: string; dibayar: string; sisa: string;
      daysOverdue: number; bucket: string;
      payments: Array<{ nomor: string | null; tanggal: string; total: string }>;
    }>,
  ): Content {
    const head: TableCell[] = [
      { text: 'Nomor', bold: true, fontSize: 9, fillColor: '#F5F1E8' },
      { text: 'Tanggal', bold: true, fontSize: 9, fillColor: '#F5F1E8' },
      { text: 'Jatuh Tempo', bold: true, fontSize: 9, fillColor: '#F5F1E8' },
      { text: 'Umur', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: 'Netto', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: 'Dibayar', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
      { text: 'Sisa', bold: true, fontSize: 9, alignment: 'right', fillColor: '#F5F1E8' },
    ];
    const body: TableCell[][] = [head];
    for (const inv of invoices) {
      body.push([
        { text: inv.nomor ?? '—', fontSize: 8 },
        { text: inv.tanggal, fontSize: 8 },
        { text: inv.jatuhTempo, fontSize: 8 },
        {
          text: inv.daysOverdue > 0 ? `+${inv.daysOverdue}` : String(inv.daysOverdue),
          fontSize: 8, alignment: 'right',
          color: inv.daysOverdue > 0 ? '#a40' : '#666',
        },
        { text: this.pdf.formatRp(inv.totalNetto), fontSize: 8, alignment: 'right' },
        { text: this.pdf.formatRp(inv.dibayar), fontSize: 8, alignment: 'right', color: '#666' },
        { text: this.pdf.formatRp(inv.sisa), fontSize: 8, alignment: 'right', bold: true },
      ]);
      for (const p of inv.payments) {
        body.push([
          { text: `  ↳ ${p.nomor ?? '—'}`, fontSize: 8, color: '#666', italics: true },
          { text: p.tanggal, fontSize: 8, color: '#666', italics: true },
          { text: 'pelunasan', fontSize: 8, color: '#999', italics: true, colSpan: 3 },
          {}, {},
          { text: `(${this.pdf.formatRp(p.total)})`, fontSize: 8, color: '#666', italics: true, alignment: 'right' },
          {},
        ]);
      }
    }
    return {
      table: { widths: [90, 60, 60, 40, 80, 80, 80], headerRows: 1, body },
      layout: 'lightHorizontalLines',
    };
  }

  private statementBuckets(
    buckets: { belumJatuh: string; b1_30: string; b31_60: string; b61_90: string; above90: string },
    totalSaldo: string,
  ): Content {
    return {
      columns: [
        { text: `Belum JT: ${this.pdf.formatRp(buckets.belumJatuh)}`, fontSize: 9 },
        { text: `1-30: ${this.pdf.formatRp(buckets.b1_30)}`, fontSize: 9 },
        { text: `31-60: ${this.pdf.formatRp(buckets.b31_60)}`, fontSize: 9 },
        { text: `61-90: ${this.pdf.formatRp(buckets.b61_90)}`, fontSize: 9 },
        { text: `>90: ${this.pdf.formatRp(buckets.above90)}`, fontSize: 9 },
        { text: `Saldo: ${this.pdf.formatRp(totalSaldo)}`, fontSize: 10, bold: true, alignment: 'right' },
      ],
      margin: [0, 6, 0, 10],
    };
  }

  buildArStatement(data: ArStatementResponse, tenantNama: string): Promise<Buffer> {
    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        this.agingHeader(
          `Statement Piutang — ${data.customer.kode} ${data.customer.nama}`,
          data.asOf, tenantNama,
        ),
        this.statementBuckets(data.totalBuckets, data.totalSaldo),
        this.statementTable(data.invoices),
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }

  buildApStatement(data: ApStatementResponse, tenantNama: string): Promise<Buffer> {
    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        this.agingHeader(
          `Statement Utang — ${data.vendor.kode} ${data.vendor.nama}`,
          data.asOf, tenantNama,
        ),
        this.statementBuckets(data.totalBuckets, data.totalSaldo),
        this.statementTable(data.invoices),
      ],
      footer: () => this.footer(),
      defaultStyle: { font: 'Roboto' },
    };
    return this.pdf.buildBuffer(def);
  }
}
