import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { InvoiceStatus } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';

export interface SptPpnLine {
  nomor: string | null;
  tanggal: Date;
  pihakNama: string;
  pihakNpwp: string | null;
  pihakIsPkp: boolean;
  kodeFakturPajak: string | null;
  nsfp: string | null;
  dpp: string;
  ppn: string;
  /// 'KELUARAN' | 'MASUKAN'
  sisi: 'KELUARAN' | 'MASUKAN';
}

export interface SptPpnResponse {
  periode: { id: string; label: string; startDate: Date; endDate: Date };
  ppnKeluaran: {
    rows: SptPpnLine[];
    totalDpp: string;
    totalPpn: string;
  };
  ppnMasukan: {
    rows: SptPpnLine[];
    totalDpp: string;
    totalPpn: string;
  };
  /// Selisih: PPN keluaran - PPN masukan
  /// > 0 → KURANG BAYAR (perlu setor ke kas negara)
  /// < 0 → LEBIH BAYAR (bisa direstitusi atau dikompensasi)
  ppnKurangLebihBayar: string;
  status: 'KURANG_BAYAR' | 'LEBIH_BAYAR' | 'NIHIL';
}

/**
 * SPT Masa PPN (form 1111).
 *
 * Aturan ringkasan:
 *   - PPN Keluaran: dari semua faktur penjualan POSTED periode tsb (filter
 *     status != CANCELLED). Tidak peduli pelanggan PKP atau bukan — PPN tetap
 *     dipungut kalau item BKP/JKP dan kita PKP.
 *   - PPN Masukan: dari semua tagihan pembelian POSTED periode tsb, hanya yg
 *     vendor PKP (yang non-PKP tidak terbit FP masukan yang bisa dikreditkan).
 *   - Selisih = keluaran - masukan. Kurang bayar disetor masa berikutnya.
 */
@Injectable()
export class SptPpnService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly excel: ExcelService,
  ) {}

  async exportXlsx(opts: { periodId: string }): Promise<Buffer> {
    const data = await this.build(opts);
    const allRows = [
      ...data.ppnKeluaran.rows.map((r) => ({ ...r, sisi: 'KELUARAN' as const })),
      ...data.ppnMasukan.rows.map((r) => ({ ...r, sisi: 'MASUKAN' as const })),
    ];
    return this.excel.buildBuffer(
      `SPT PPN ${data.periode.label}`,
      [
        { header: 'Sisi', key: 'sisi', width: 12, value: (r) => r.sisi },
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor ?? '' },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Lawan', key: 'pihak', width: 28,
          value: (r) => `${r.pihakNama}${r.pihakIsPkp ? ' (PKP)' : ''}` },
        { header: 'NPWP', key: 'npwp', width: 20, value: (r) => r.pihakNpwp ?? '' },
        { header: 'Kode FP', key: 'kfp', width: 10, value: (r) => r.kodeFakturPajak ?? '' },
        { header: 'NSFP', key: 'nsfp', width: 18, value: (r) => r.nsfp ?? '' },
        { header: 'DPP', key: 'dpp', width: 16, format: 'currency', value: (r) => r.dpp },
        { header: 'PPN', key: 'ppn', width: 14, format: 'currency', value: (r) => r.ppn },
      ],
      allRows,
    );
  }

  async build(opts: { periodId: string }): Promise<SptPpnResponse> {
    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: opts.periodId },
        select: { id: true, label: true, startDate: true, endDate: true },
      });
      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      // Keluaran: sales invoice POSTED dgn totalPpn > 0
      const sales = await tx.salesInvoice.findMany({
        where: {
          tanggal: { gte: period.startDate, lte: period.endDate },
          status: { in: [InvoiceStatus.POSTED, InvoiceStatus.PARTIAL, InvoiceStatus.PAID] },
          totalPpn: { gt: 0 },
        },
        orderBy: { tanggal: 'asc' },
        include: { customer: { select: { nama: true, npwp: true, isPkp: true } } },
      });

      // Masukan: purchase invoice POSTED dgn totalPpn > 0 (vendor PKP otomatis filter via totalPpn > 0,
      // karena di PurchaseService kita skip PPN kalau vendor non-PKP)
      const purchases = await tx.purchaseInvoice.findMany({
        where: {
          tanggal: { gte: period.startDate, lte: period.endDate },
          status: { in: [InvoiceStatus.POSTED, InvoiceStatus.PARTIAL, InvoiceStatus.PAID] },
          totalPpn: { gt: 0 },
        },
        orderBy: { tanggal: 'asc' },
        include: { vendor: { select: { nama: true, npwp: true, isPkp: true } } },
      });

      const keluaranRows: SptPpnLine[] = sales.map((s) => ({
        nomor: s.nomor,
        tanggal: s.tanggal,
        pihakNama: s.customer.nama,
        pihakNpwp: s.customer.npwp,
        pihakIsPkp: s.customer.isPkp,
        kodeFakturPajak: s.kodeFakturPajak,
        nsfp: s.nsfp,
        dpp: s.totalDpp.toString(),
        ppn: s.totalPpn.toString(),
        sisi: 'KELUARAN',
      }));
      const masukanRows: SptPpnLine[] = purchases.map((p) => ({
        nomor: p.nomor,
        tanggal: p.tanggal,
        pihakNama: p.vendor.nama,
        pihakNpwp: p.vendor.npwp,
        pihakIsPkp: p.vendor.isPkp,
        kodeFakturPajak: null,
        nsfp: p.nsfpMasukan,
        dpp: p.totalDpp.toString(),
        ppn: p.totalPpn.toString(),
        sisi: 'MASUKAN',
      }));

      const sumKeluaranDpp = keluaranRows.reduce((a, r) => a.plus(new Decimal(r.dpp)), new Decimal(0));
      const sumKeluaranPpn = keluaranRows.reduce((a, r) => a.plus(new Decimal(r.ppn)), new Decimal(0));
      const sumMasukanDpp = masukanRows.reduce((a, r) => a.plus(new Decimal(r.dpp)), new Decimal(0));
      const sumMasukanPpn = masukanRows.reduce((a, r) => a.plus(new Decimal(r.ppn)), new Decimal(0));
      const selisih = sumKeluaranPpn.minus(sumMasukanPpn);

      let status: SptPpnResponse['status'] = 'NIHIL';
      if (selisih.gt(0)) status = 'KURANG_BAYAR';
      else if (selisih.lt(0)) status = 'LEBIH_BAYAR';

      return {
        periode: period,
        ppnKeluaran: {
          rows: keluaranRows,
          totalDpp: sumKeluaranDpp.toFixed(2),
          totalPpn: sumKeluaranPpn.toFixed(2),
        },
        ppnMasukan: {
          rows: masukanRows,
          totalDpp: sumMasukanDpp.toFixed(2),
          totalPpn: sumMasukanPpn.toFixed(2),
        },
        ppnKurangLebihBayar: selisih.toFixed(2),
        status,
      };
    });
  }
}
