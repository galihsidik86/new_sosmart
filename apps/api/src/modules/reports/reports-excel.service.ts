import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { LabaRugiResponse } from './laba-rugi.service.js';
import type { NeracaResponse } from './neraca.service.js';
import type { ArusKasResponse } from './arus-kas.service.js';
import type { PerubahanEkuitasResponse } from './perubahan-ekuitas.service.js';
import type { TrialBalanceResponse } from '../ledger/trial-balance.service.js';
import type { BudgetActualResponse } from './budget-actual.service.js';

/**
 * Render Excel untuk 5 laporan keuangan. Format bebas (bukan ExcelService
 * tabular helper) karena tiap laporan punya section + total + sub-total
 * yang tidak fit ke single-table.
 */
@Injectable()
export class ReportsExcelService {
  private async toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    const ab = await wb.xlsx.writeBuffer();
    return Buffer.from(new Uint8Array(ab as ArrayBufferLike)) as Buffer;
  }

  private header(ws: ExcelJS.Worksheet, tenantNama: string, judul: string, sub: string) {
    ws.mergeCells('A1:D1');
    ws.getCell('A1').value = tenantNama;
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getCell('A1').font = { bold: true, size: 12 };
    ws.mergeCells('A2:D2');
    ws.getCell('A2').value = judul;
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getCell('A2').font = { bold: true, size: 14 };
    ws.mergeCells('A3:D3');
    ws.getCell('A3').value = sub;
    ws.getCell('A3').alignment = { horizontal: 'center' };
    ws.getCell('A3').font = { color: { argb: 'FF666666' } };
  }

  // -------- 1. Laba-Rugi --------
  async buildLabaRugi(data: LabaRugiResponse, tenantNama: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Laba Rugi');
    ws.columns = [
      { key: 'kode', width: 12 },
      { key: 'nama', width: 38 },
      { key: 'nilai', width: 18 },
      { key: 'total', width: 18 },
    ];
    this.header(ws, tenantNama, 'Laporan Laba Rugi', `Periode: ${data.periode.label}`);
    let r = 5;
    const section = (title: string, rows: { kode: string; nama: string; nilai: string }[], total: string, totalLabel: string) => {
      ws.getCell(`A${r}`).value = title;
      ws.getCell(`A${r}`).font = { bold: true };
      r++;
      for (const row of rows) {
        ws.getCell(`A${r}`).value = row.kode;
        ws.getCell(`B${r}`).value = row.nama;
        ws.getCell(`C${r}`).value = Number(row.nilai);
        ws.getCell(`C${r}`).numFmt = '#,##0.00';
        r++;
      }
      ws.getCell(`B${r}`).value = totalLabel;
      ws.getCell(`B${r}`).font = { bold: true };
      ws.getCell(`D${r}`).value = Number(total);
      ws.getCell(`D${r}`).numFmt = '#,##0.00';
      ws.getCell(`D${r}`).font = { bold: true };
      r += 2;
    };
    const subtotal = (label: string, value: string) => {
      ws.getCell(`B${r}`).value = label;
      ws.getCell(`B${r}`).font = { bold: true, size: 12 };
      ws.getCell(`D${r}`).value = Number(value);
      ws.getCell(`D${r}`).numFmt = '#,##0.00';
      ws.getCell(`D${r}`).font = { bold: true, size: 12 };
      r += 2;
    };

    section('PENDAPATAN', data.pendapatan.rows, data.pendapatan.total, 'Total Pendapatan');
    section('BEBAN POKOK PENJUALAN', data.bebanPokok.rows, data.bebanPokok.total, 'Total HPP');
    subtotal('LABA KOTOR', data.labaKotor.nilai);
    section('BEBAN OPERASI', data.bebanOperasi.rows, data.bebanOperasi.total, 'Total Beban Operasi');
    subtotal('LABA USAHA', data.labaUsaha.nilai);
    if (data.pendapatanLain.rows.length) {
      section('PENDAPATAN LAIN', data.pendapatanLain.rows, data.pendapatanLain.total, 'Total Pendapatan Lain');
    }
    if (data.bebanLain.rows.length) {
      section('BEBAN LAIN', data.bebanLain.rows, data.bebanLain.total, 'Total Beban Lain');
    }
    subtotal('LABA SEBELUM PAJAK', data.labaSebelumPajak.nilai);
    if (Number(data.bebanPajak.nilai) > 0) {
      ws.getCell(`B${r}`).value = 'Beban PPh';
      ws.getCell(`D${r}`).value = Number(data.bebanPajak.nilai);
      ws.getCell(`D${r}`).numFmt = '#,##0.00';
      r += 2;
    }
    subtotal('LABA BERSIH', data.labaBersih.nilai);
    return this.toBuffer(wb);
  }

  // -------- 2. Neraca --------
  async buildNeraca(data: NeracaResponse, tenantNama: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Neraca');
    ws.columns = [
      { key: 'kode', width: 12 },
      { key: 'nama', width: 38 },
      { key: 'nilai', width: 18 },
      { key: 'total', width: 18 },
    ];
    this.header(ws, tenantNama, 'Neraca', `Per akhir periode ${data.periode.label}`);
    let r = 5;
    const section = (title: string, rows: { kode: string; nama: string; nilai: string }[], total: string, totalLabel: string) => {
      ws.getCell(`A${r}`).value = title;
      ws.getCell(`A${r}`).font = { bold: true };
      r++;
      for (const row of rows) {
        ws.getCell(`A${r}`).value = row.kode;
        ws.getCell(`B${r}`).value = row.nama;
        ws.getCell(`C${r}`).value = Number(row.nilai);
        ws.getCell(`C${r}`).numFmt = '#,##0.00';
        r++;
      }
      ws.getCell(`B${r}`).value = totalLabel;
      ws.getCell(`B${r}`).font = { bold: true };
      ws.getCell(`D${r}`).value = Number(total);
      ws.getCell(`D${r}`).numFmt = '#,##0.00';
      ws.getCell(`D${r}`).font = { bold: true };
      r += 2;
    };
    section('ASET LANCAR', data.asetLancar.rows, data.asetLancar.total, 'Total Aset Lancar');
    section('ASET TETAP', data.asetTetap.rows, data.asetTetap.total, 'Total Aset Tetap');
    ws.getCell(`B${r}`).value = 'TOTAL ASET';
    ws.getCell(`B${r}`).font = { bold: true, size: 12 };
    ws.getCell(`D${r}`).value = Number(data.totalAset.nilai);
    ws.getCell(`D${r}`).numFmt = '#,##0.00';
    ws.getCell(`D${r}`).font = { bold: true, size: 12 };
    r += 3;
    section('LIABILITAS JANGKA PENDEK', data.liabilitasJangkaPendek.rows, data.liabilitasJangkaPendek.total, 'Total Liab Jangka Pendek');
    section('LIABILITAS JANGKA PANJANG', data.liabilitasJangkaPanjang.rows, data.liabilitasJangkaPanjang.total, 'Total Liab Jangka Panjang');
    section('EKUITAS', data.ekuitas.rows, data.ekuitas.total, 'Total Ekuitas');
    ws.getCell(`B${r}`).value = 'Laba berjalan periode';
    ws.getCell(`D${r}`).value = Number(data.labaBerjalan.nilai);
    ws.getCell(`D${r}`).numFmt = '#,##0.00';
    r += 2;
    ws.getCell(`B${r}`).value = 'TOTAL LIABILITAS + EKUITAS';
    ws.getCell(`B${r}`).font = { bold: true, size: 12 };
    ws.getCell(`D${r}`).value = Number(data.totalLiabilitasEkuitas.nilai);
    ws.getCell(`D${r}`).numFmt = '#,##0.00';
    ws.getCell(`D${r}`).font = { bold: true, size: 12 };
    r += 2;
    ws.getCell(`A${r}`).value = data.balanced ? '✓ Neraca seimbang' : `⚠ Selisih: ${data.selisih}`;
    ws.getCell(`A${r}`).font = { italic: true, color: { argb: data.balanced ? 'FF666666' : 'FFA40000' } };
    return this.toBuffer(wb);
  }

  // -------- 3. Arus Kas --------
  async buildArusKas(data: ArusKasResponse, tenantNama: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Arus Kas');
    ws.columns = [
      { key: 'label', width: 50 },
      { key: 'nilai', width: 20 },
    ];
    this.header(ws, tenantNama, 'Laporan Arus Kas — Metode Tidak Langsung', `Periode: ${data.periode.label}`);
    let r = 5;
    const section = (title: string, rows: { label: string; nilai: string }[], total: string, totalLabel: string) => {
      ws.getCell(`A${r}`).value = title;
      ws.getCell(`A${r}`).font = { bold: true };
      r++;
      for (const row of rows) {
        ws.getCell(`A${r}`).value = row.label;
        ws.getCell(`B${r}`).value = Number(row.nilai);
        ws.getCell(`B${r}`).numFmt = '#,##0.00';
        r++;
      }
      ws.getCell(`A${r}`).value = totalLabel;
      ws.getCell(`A${r}`).font = { bold: true };
      ws.getCell(`B${r}`).value = Number(total);
      ws.getCell(`B${r}`).numFmt = '#,##0.00';
      ws.getCell(`B${r}`).font = { bold: true };
      r += 2;
    };
    section('A. AKTIVITAS OPERASI', data.operasi.rows, data.operasi.total, 'Kas Bersih Operasi');
    section('B. AKTIVITAS INVESTASI', data.investasi.rows, data.investasi.total, 'Kas Bersih Investasi');
    section('C. AKTIVITAS PENDANAAN', data.pendanaan.rows, data.pendanaan.total, 'Kas Bersih Pendanaan');
    ws.getCell(`A${r}`).value = 'KENAIKAN (PENURUNAN) KAS BERSIH';
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`B${r}`).value = Number(data.kenaikanKasBersih);
    ws.getCell(`B${r}`).numFmt = '#,##0.00';
    ws.getCell(`B${r}`).font = { bold: true };
    r++;
    ws.getCell(`A${r}`).value = 'Kas & Bank Awal Periode';
    ws.getCell(`B${r}`).value = Number(data.kasAwal);
    ws.getCell(`B${r}`).numFmt = '#,##0.00';
    r++;
    ws.getCell(`A${r}`).value = 'KAS & BANK AKHIR PERIODE';
    ws.getCell(`A${r}`).font = { bold: true, size: 12 };
    ws.getCell(`B${r}`).value = Number(data.kasAkhir);
    ws.getCell(`B${r}`).numFmt = '#,##0.00';
    ws.getCell(`B${r}`).font = { bold: true, size: 12 };
    return this.toBuffer(wb);
  }

  // -------- 4. Perubahan Ekuitas --------
  async buildPerubahanEkuitas(data: PerubahanEkuitasResponse, tenantNama: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Perubahan Ekuitas');
    ws.columns = [
      { key: 'label', width: 36 },
      { key: 'modal', width: 18 },
      { key: 'laba', width: 18 },
      { key: 'total', width: 18 },
    ];
    this.header(ws, tenantNama, 'Laporan Perubahan Ekuitas', `Periode: ${data.periode.label}`);
    let r = 5;
    // Header tabel
    const headers = ['Keterangan', 'Modal Disetor', 'Saldo Laba', 'Total Ekuitas'];
    headers.forEach((h, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE7D8' } };
    });
    r++;
    const row = (label: string, modal: string | null, laba: string | null, total: string | null, bold = false) => {
      ws.getCell(`A${r}`).value = label;
      if (modal !== null) {
        ws.getCell(`B${r}`).value = Number(modal);
        ws.getCell(`B${r}`).numFmt = '#,##0.00';
      }
      if (laba !== null) {
        ws.getCell(`C${r}`).value = Number(laba);
        ws.getCell(`C${r}`).numFmt = '#,##0.00';
      }
      if (total !== null) {
        ws.getCell(`D${r}`).value = Number(total);
        ws.getCell(`D${r}`).numFmt = '#,##0.00';
      }
      if (bold) {
        ['A', 'B', 'C', 'D'].forEach((c) => { ws.getCell(`${c}${r}`).font = { bold: true }; });
      }
      r++;
    };
    row('Saldo Awal Periode', data.saldoAwal.modal, data.saldoAwal.saldoLaba, data.saldoAwal.total, true);
    row('+ Penambahan Modal Disetor', data.tambahanModal, null, data.tambahanModal);
    row('+ Laba Bersih Periode', null, data.labaBersih, data.labaBersih);
    row('− Dividen / Prive', null, `-${data.dividen}`, `-${data.dividen}`);
    row('Saldo Akhir Periode', data.saldoAkhir.modal, data.saldoAkhir.saldoLaba, data.saldoAkhir.total, true);
    return this.toBuffer(wb);
  }

  // -------- 5. Trial Balance --------
  async buildTrialBalance(data: TrialBalanceResponse, tenantNama: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Neraca Saldo');
    ws.columns = [
      { key: 'kode', width: 12 },
      { key: 'nama', width: 32 },
      { key: 'kind', width: 16 },
      { key: 'awalDebit', width: 16 },
      { key: 'awalKredit', width: 16 },
      { key: 'mutDebit', width: 16 },
      { key: 'mutKredit', width: 16 },
      { key: 'akhirDebit', width: 16 },
      { key: 'akhirKredit', width: 16 },
    ];
    ws.mergeCells('A1:I1');
    ws.getCell('A1').value = tenantNama;
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getCell('A1').font = { bold: true, size: 12 };
    ws.mergeCells('A2:I2');
    ws.getCell('A2').value = 'Neraca Saldo (Trial Balance)';
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getCell('A2').font = { bold: true, size: 14 };
    ws.mergeCells('A3:I3');
    ws.getCell('A3').value = `Periode: ${data.period.label}`;
    ws.getCell('A3').alignment = { horizontal: 'center' };
    ws.getCell('A3').font = { color: { argb: 'FF666666' } };

    // Table header
    const headers = ['Kode', 'Nama Akun', 'Jenis', 'Saldo Awal D', 'Saldo Awal K', 'Mutasi D', 'Mutasi K', 'Saldo Akhir D', 'Saldo Akhir K'];
    headers.forEach((h, i) => {
      const cell = ws.getCell(5, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE7D8' } };
      cell.alignment = { horizontal: 'center' };
    });

    let r = 6;
    for (const row of data.rows) {
      ws.getCell(`A${r}`).value = row.kode;
      ws.getCell(`B${r}`).value = row.nama;
      ws.getCell(`C${r}`).value = row.kind;
      ws.getCell(`D${r}`).value = Number(row.saldoAwalDebit);
      ws.getCell(`E${r}`).value = Number(row.saldoAwalKredit);
      ws.getCell(`F${r}`).value = Number(row.mutasiDebit);
      ws.getCell(`G${r}`).value = Number(row.mutasiKredit);
      ws.getCell(`H${r}`).value = Number(row.saldoAkhirDebit);
      ws.getCell(`I${r}`).value = Number(row.saldoAkhirKredit);
      ['D', 'E', 'F', 'G', 'H', 'I'].forEach((c) => { ws.getCell(`${c}${r}`).numFmt = '#,##0.00'; });
      r++;
    }
    // Totals
    ws.getCell(`B${r}`).value = 'TOTAL';
    ws.getCell(`B${r}`).font = { bold: true };
    [['D', data.totals.saldoAwalDebit], ['E', data.totals.saldoAwalKredit],
     ['F', data.totals.mutasiDebit], ['G', data.totals.mutasiKredit],
     ['H', data.totals.saldoAkhirDebit], ['I', data.totals.saldoAkhirKredit]].forEach(([col, val]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = Number(val);
      cell.numFmt = '#,##0.00';
      cell.font = { bold: true };
    });
    return this.toBuffer(wb);
  }

  // -------- 6. Budget vs Actual --------
  async buildBudgetActual(data: BudgetActualResponse, tenantNama: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Budget vs Actual');
    ws.columns = [
      { key: 'project', width: 24 },
      { key: 'akun', width: 32 },
      { key: 'budget', width: 16 },
      { key: 'actual', width: 16 },
      { key: 'variance', width: 16 },
      { key: 'util', width: 12 },
      { key: 'status', width: 12 },
    ];
    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = tenantNama;
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getCell('A1').font = { bold: true, size: 12 };
    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = 'Budget vs Actual';
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getCell('A2').font = { bold: true, size: 14 };
    ws.mergeCells('A3:G3');
    ws.getCell('A3').value = `Periode: ${data.periode}`;
    ws.getCell('A3').alignment = { horizontal: 'center' };
    ws.getCell('A3').font = { color: { argb: 'FF666666' } };

    const headers = ['Project', 'Akun', 'Budget', 'Actual', 'Variance', 'Utilisasi %', 'Status'];
    headers.forEach((h, i) => {
      const cell = ws.getCell(5, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE7D8' } };
      cell.alignment = { horizontal: 'center' };
    });

    let r = 6;
    for (const g of data.projects) {
      ws.getCell(`A${r}`).value = `${g.project.kode} — ${g.project.nama}`;
      ws.getCell(`A${r}`).font = { bold: true };
      ws.mergeCells(`A${r}:G${r}`);
      r++;
      for (const row of g.rows) {
        ws.getCell(`A${r}`).value = '';
        ws.getCell(`B${r}`).value = `${row.account.kode} — ${row.account.nama}`;
        ws.getCell(`C${r}`).value = Number(row.budget);
        ws.getCell(`D${r}`).value = Number(row.actual);
        ws.getCell(`E${r}`).value = Number(row.variance);
        ws.getCell(`F${r}`).value = Number(row.utilisasiPersen);
        ws.getCell(`G${r}`).value = row.status;
        ['C', 'D', 'E'].forEach((c) => { ws.getCell(`${c}${r}`).numFmt = '#,##0.00'; });
        ws.getCell(`F${r}`).numFmt = '0.00"%"';
        r++;
      }
      // Sub-total group
      ws.getCell(`B${r}`).value = 'Sub-total';
      ws.getCell(`B${r}`).font = { bold: true };
      ws.getCell(`C${r}`).value = Number(g.totalBudget);
      ws.getCell(`D${r}`).value = Number(g.totalActual);
      ws.getCell(`E${r}`).value = Number(g.totalVariance);
      ['C', 'D', 'E'].forEach((c) => {
        ws.getCell(`${c}${r}`).numFmt = '#,##0.00';
        ws.getCell(`${c}${r}`).font = { bold: true };
      });
      r += 2;
    }

    // Grand total
    ws.getCell(`B${r}`).value = 'GRAND TOTAL';
    ws.getCell(`B${r}`).font = { bold: true, size: 12 };
    ws.getCell(`C${r}`).value = Number(data.grandTotal.budget);
    ws.getCell(`D${r}`).value = Number(data.grandTotal.actual);
    ws.getCell(`E${r}`).value = Number(data.grandTotal.variance);
    ['C', 'D', 'E'].forEach((c) => {
      ws.getCell(`${c}${r}`).numFmt = '#,##0.00';
      ws.getCell(`${c}${r}`).font = { bold: true, size: 12 };
    });

    return this.toBuffer(wb);
  }
}
