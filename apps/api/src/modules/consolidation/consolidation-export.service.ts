import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces.js';
import { PdfService } from '../../common/pdf/pdf.service.js';
import type { ConsolidationResult } from './consolidation.engine.js';

const KIND_LABEL: Record<string, string> = {
  ASET: 'Aset', LIABILITAS: 'Liabilitas', EKUITAS: 'Ekuitas',
  PENDAPATAN: 'Pendapatan', PENDAPATAN_LAIN: 'Pendapatan Lain',
  BEBAN: 'Beban', BEBAN_POKOK: 'Beban Pokok', BEBAN_LAIN: 'Beban Lain',
};

const ymd = (d: Date | string): string => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));

@Injectable()
export class ConsolidationExportService {
  constructor(private readonly pdf: PdfService) {}

  // ============================================================ EXCEL
  async buildExcel(r: ConsolidationResult, tenantNama: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const periode = `Neraca per ${ymd(r.periode.endDate)}${r.periode.startDate ? ` · L/R sejak ${ymd(r.periode.startDate)}` : ' · L/R sejak awal'}`;
    const money = '#,##0.00;(#,##0.00)';

    // -- Sheet 1: Ringkasan --
    const s1 = wb.addWorksheet('Ringkasan');
    s1.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }];
    s1.getCell('A1').value = tenantNama; s1.getCell('A1').font = { bold: true, size: 12 };
    s1.getCell('A2').value = `Konsolidasi Grup — ${r.group.nama}`; s1.getCell('A2').font = { bold: true, size: 14 };
    s1.getCell('A3').value = periode; s1.getCell('A3').font = { color: { argb: 'FF666666' } };
    s1.getCell('A4').value = `Mata uang: IDR · Dibuat ${new Date().toLocaleString('id-ID')}`;
    s1.getCell('A4').font = { color: { argb: 'FF888888' }, size: 9 };

    let row = 6;
    const kpi = (label: string, val: string) => {
      s1.getCell(`A${row}`).value = label;
      s1.getCell(`B${row}`).value = Number(val); s1.getCell(`B${row}`).numFmt = money;
      row++;
    };
    s1.getCell(`A${row}`).value = 'RINGKASAN'; s1.getCell(`A${row}`).font = { bold: true }; row++;
    kpi('Total Aset Konsolidasi', r.neraca.totalAset);
    kpi('Total Liabilitas', r.neraca.totalLiabilitas);
    kpi('Total Ekuitas Konsolidasi', r.neraca.totalEkuitasKonsolidasi);
    kpi('  — Ekuitas Induk', r.neraca.ekuitasIndukInduk);
    kpi('  — Kepentingan Minoritas (NCI)', r.neraca.kepentinganMinoritas);
    kpi('Goodwill', r.goodwill.total);
    kpi('Laba Bersih Konsolidasi', r.labaRugi.labaBersihKonsolidasi);
    kpi('  — Laba Induk', r.labaRugi.labaIndukInduk);
    kpi('  — Laba Minoritas', r.labaRugi.labaMinoritas);
    row++;

    // Integritas
    s1.getCell(`A${row}`).value = 'INTEGRITAS'; s1.getCell(`A${row}`).font = { bold: true }; row++;
    s1.getCell(`A${row}`).value = 'Neraca seimbang'; s1.getCell(`B${row}`).value = r.integritas.neracaBalanced ? 'YA' : 'TIDAK'; row++;
    s1.getCell(`A${row}`).value = 'Intercompany terekonsiliasi'; s1.getCell(`B${row}`).value = r.integritas.icTerekonsiliasi ? 'YA' : `TIDAK (${r.integritas.jumlahIcTidakCocok} pasangan)`; row++;
    if (r.integritas.entitasBelumTutupBuku.length) {
      s1.getCell(`A${row}`).value = 'Entitas belum tutup buku';
      s1.getCell(`B${row}`).value = r.integritas.entitasBelumTutupBuku.map((e) => `${e.nama} (${e.status})`).join(', '); row++;
    }
    row++;

    // Entitas
    s1.getCell(`A${row}`).value = 'ENTITAS'; s1.getCell(`A${row}`).font = { bold: true }; row++;
    ['Badan Usaha', 'Kepemilikan %', 'Aset Bersih', 'Laba Bersih'].forEach((h, i) => {
      const cell = s1.getCell(row, i + 1); cell.value = h; cell.font = { bold: true };
    });
    row++;
    for (const e of r.entities) {
      s1.getCell(row, 1).value = e.nama + (e.isParent ? ' (Induk)' : '');
      s1.getCell(row, 2).value = Number(e.ownershipPct);
      s1.getCell(row, 3).value = Number(e.netAssets); s1.getCell(row, 3).numFmt = money;
      s1.getCell(row, 4).value = Number(e.netIncome); s1.getCell(row, 4).numFmt = money;
      row++;
    }

    // -- Sheet 2: Neraca (kertas kerja per-entitas) --
    this.worksheetSheet(wb, 'Neraca Konsolidasi', r, r.neraca.rows, tenantNama, periode);
    // -- Sheet 3: Laba Rugi --
    this.worksheetSheet(wb, 'Laba Rugi', r, r.labaRugi.rows, tenantNama, periode);

    // -- Sheet 4: Rekonsiliasi IC --
    if (r.icRekon.length) {
      const s4 = wb.addWorksheet('Rekonsiliasi IC');
      s4.columns = [{ width: 28 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 10 }];
      ['Dari', 'Ke', 'Piutang IC', 'Utang Lawan', 'Selisih', 'Cocok'].forEach((h, i) => {
        const cell = s4.getCell(1, i + 1); cell.value = h; cell.font = { bold: true };
      });
      r.icRekon.forEach((ic, idx) => {
        const rr = idx + 2;
        s4.getCell(rr, 1).value = ic.dari; s4.getCell(rr, 2).value = ic.ke;
        s4.getCell(rr, 3).value = Number(ic.piutang); s4.getCell(rr, 3).numFmt = money;
        s4.getCell(rr, 4).value = Number(ic.utangLawan); s4.getCell(rr, 4).numFmt = money;
        s4.getCell(rr, 5).value = Number(ic.selisih); s4.getCell(rr, 5).numFmt = money;
        s4.getCell(rr, 6).value = ic.cocok ? '✓' : '✗';
      });
    }

    const ab = await wb.xlsx.writeBuffer();
    return Buffer.from(new Uint8Array(ab as ArrayBufferLike)) as Buffer;
  }

  private worksheetSheet(
    wb: ExcelJS.Workbook, name: string, r: ConsolidationResult,
    rows: ConsolidationResult['neraca']['rows'], tenantNama: string, periode: string,
  ) {
    const money = '#,##0.00;(#,##0.00)';
    const ws = wb.addWorksheet(name);
    const entCols = r.entities.map((e) => e.nama);
    ws.columns = [{ width: 10 }, { width: 32 }, ...entCols.map(() => ({ width: 16 })), { width: 16 }, { width: 14 }, { width: 16 }];
    ws.getCell('A1').value = `${tenantNama} — ${name} Konsolidasi (${r.group.nama})`; ws.getCell('A1').font = { bold: true, size: 12 };
    ws.getCell('A2').value = periode; ws.getCell('A2').font = { color: { argb: 'FF666666' } };
    const head = ['Kode', 'Akun', ...entCols, 'Gabungan', 'Eliminasi', 'Konsolidasi'];
    head.forEach((h, i) => { const cell = ws.getCell(4, i + 1); cell.value = h; cell.font = { bold: true }; });
    let rr = 5;
    for (const row of rows) {
      ws.getCell(rr, 1).value = row.kode;
      ws.getCell(rr, 2).value = row.nama + (row.isIntercompany ? ' [IC]' : '');
      r.entities.forEach((e, i) => {
        const v = row.perEntity[e.tenantId];
        if (v != null) { const c = ws.getCell(rr, 3 + i); c.value = Number(v); c.numFmt = money; }
      });
      const base = 3 + entCols.length;
      ws.getCell(rr, base).value = Number(row.combined); ws.getCell(rr, base).numFmt = money;
      ws.getCell(rr, base + 1).value = Number(row.eliminasi); ws.getCell(rr, base + 1).numFmt = money;
      const kc = ws.getCell(rr, base + 2); kc.value = Number(row.konsolidasi); kc.numFmt = money; kc.font = { bold: true };
      rr++;
    }
  }

  // ============================================================ PDF
  async buildPdf(r: ConsolidationResult, tenantNama: string, logo?: string | null): Promise<Buffer> {
    const rp = (v: string | number) => this.pdf.formatRp(v);
    const periode = `Neraca per ${ymd(r.periode.endDate)}${r.periode.startDate ? ` · L/R sejak ${ymd(r.periode.startDate)}` : ' · L/R sejak awal'}`;

    const kpiTable: TableCell[][] = [
      [{ text: 'Total Aset', bold: true }, { text: rp(r.neraca.totalAset), alignment: 'right' }],
      [{ text: 'Total Liabilitas' }, { text: rp(r.neraca.totalLiabilitas), alignment: 'right' }],
      [{ text: 'Ekuitas Konsolidasi', bold: true }, { text: rp(r.neraca.totalEkuitasKonsolidasi), alignment: 'right' }],
      [{ text: '  Ekuitas Induk' }, { text: rp(r.neraca.ekuitasIndukInduk), alignment: 'right' }],
      [{ text: '  Kepentingan Minoritas (NCI)' }, { text: rp(r.neraca.kepentinganMinoritas), alignment: 'right' }],
      [{ text: 'Goodwill' }, { text: rp(r.goodwill.total), alignment: 'right' }],
      [{ text: 'Laba Bersih Konsolidasi', bold: true }, { text: rp(r.labaRugi.labaBersihKonsolidasi), alignment: 'right' }],
    ];

    const entRows: TableCell[][] = [
      [{ text: 'Badan Usaha', bold: true }, { text: 'Milik %', bold: true, alignment: 'right' }, { text: 'Aset Bersih', bold: true, alignment: 'right' }, { text: 'Laba Bersih', bold: true, alignment: 'right' }],
      ...r.entities.map((e): TableCell[] => [
        { text: e.nama + (e.isParent ? ' (Induk)' : '') },
        { text: e.ownershipPct + '%', alignment: 'right' },
        { text: rp(e.netAssets), alignment: 'right' },
        { text: rp(e.netIncome), alignment: 'right' },
      ]),
    ];

    // Neraca konsolidasi: kolom Gabungan → Eliminasi → Konsolidasi (per-entitas terlalu lebar untuk PDF).
    const konsTable = (rows: ConsolidationResult['neraca']['rows']): TableCell[][] => [
      [{ text: 'Kode', bold: true }, { text: 'Akun', bold: true }, { text: 'Gabungan', bold: true, alignment: 'right' }, { text: 'Eliminasi', bold: true, alignment: 'right' }, { text: 'Konsolidasi', bold: true, alignment: 'right' }],
      ...rows.map((row): TableCell[] => [
        { text: row.kode, fontSize: 8 },
        { text: row.nama + (row.isIntercompany ? ' [IC]' : ''), fontSize: 8 },
        { text: rp(row.combined), alignment: 'right', fontSize: 8 },
        { text: Number(row.eliminasi) ? rp(row.eliminasi) : '—', alignment: 'right', fontSize: 8 },
        { text: rp(row.konsolidasi), alignment: 'right', fontSize: 8, bold: true },
      ]),
    ];

    const warn: Content[] = [];
    if (!r.integritas.neracaBalanced) warn.push({ text: `⚠ Neraca TIDAK seimbang (selisih ${rp(r.integritas.selisihNeraca)})`, color: '#AF4230', fontSize: 9, bold: true });
    if (!r.integritas.icTerekonsiliasi) warn.push({ text: `⚠ Intercompany tidak cocok: ${r.integritas.jumlahIcTidakCocok} pasangan (selisih ${rp(r.integritas.totalSelisihIntercompany)})`, color: '#AF4230', fontSize: 9, bold: true });
    if (r.integritas.entitasBelumTutupBuku.length) warn.push({ text: `📖 Belum tutup buku: ${r.integritas.entitasBelumTutupBuku.map((e) => `${e.nama} (${e.status})`).join(', ')}`, color: '#9A7735', fontSize: 9 });

    const def: TDocumentDefinitions = {
      pageMargins: [40, 40, 40, 40],
      content: [
        {
          stack: [
            ...(logo ? [{ image: logo, fit: [150, 46] as [number, number], alignment: 'center' as const, margin: [0, 0, 0, 4] as [number, number, number, number] }] : []),
            { text: tenantNama, fontSize: 12, bold: true, alignment: 'center' },
            { text: `Konsolidasi Grup — ${r.group.nama}`, fontSize: 16, bold: true, alignment: 'center', margin: [0, 4, 0, 2] },
            { text: periode, fontSize: 10, alignment: 'center', color: '#666' },
            { text: `Mata uang: IDR · Dibuat ${new Date().toLocaleString('id-ID')}`, fontSize: 8, alignment: 'center', color: '#888' },
            { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 0.5, lineColor: '#999' }] },
          ],
          margin: [0, 0, 0, 12],
        },
        ...(warn.length ? [{ stack: warn, margin: [0, 0, 0, 8] as [number, number, number, number] }] : []),
        { text: 'Ringkasan', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
        { table: { widths: ['*', 120], body: kpiTable }, layout: 'lightHorizontalLines' },
        { text: 'Entitas', bold: true, fontSize: 12, margin: [0, 12, 0, 4] },
        { table: { widths: ['*', 60, 90, 90], body: entRows }, layout: 'lightHorizontalLines' },
        ...(r.goodwill.detail.length ? [
          { text: 'Goodwill (Metode Akuisisi)', bold: true, fontSize: 12, margin: [0, 12, 0, 4] as [number, number, number, number] },
          { table: { widths: ['*', 120], body: [[{ text: 'Anak', bold: true }, { text: 'Goodwill', bold: true, alignment: 'right' as const }], ...r.goodwill.detail.map((g): TableCell[] => [{ text: g.nama }, { text: rp(g.goodwill), alignment: 'right' }])] }, layout: 'lightHorizontalLines' as const },
        ] : []),
        { text: 'Neraca Konsolidasi', bold: true, fontSize: 12, margin: [0, 12, 0, 4], pageBreak: 'before' },
        { table: { headerRows: 1, widths: [40, '*', 70, 65, 75], body: konsTable(r.neraca.rows) }, layout: 'lightHorizontalLines' },
        { text: 'Laba Rugi Konsolidasi', bold: true, fontSize: 12, margin: [0, 12, 0, 4] },
        { table: { headerRows: 1, widths: [40, '*', 70, 65, 75], body: konsTable(r.labaRugi.rows) }, layout: 'lightHorizontalLines' },
      ],
      footer: (page: number, count: number): Content => ({
        text: `Halaman ${page} / ${count} · Dicetak ${new Date().toLocaleString('id-ID')}`,
        fontSize: 8, color: '#888', alignment: 'right', margin: [40, 0, 40, 0],
      }),
      defaultStyle: { fontSize: 10 },
    };
    return this.pdf.buildBuffer(def);
  }
}
