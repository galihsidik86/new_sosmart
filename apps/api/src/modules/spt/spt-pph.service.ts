import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { BuktiPotongStatus, JenisPph } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';

export interface SptPphLine {
  nomor: string | null;
  tanggal: Date;
  pihakNama: string;
  pihakNpwp: string | null;
  pihakNik: string | null;
  dpp: string;
  tarifPersen: string;
  pph: string;
  sumberType: string | null;
}

export interface SptPphResponse {
  periode: { id: string; label: string; startDate: Date; endDate: Date };
  jenisPph: JenisPph;
  rows: SptPphLine[];
  totalDpp: string;
  totalPph: string;
  countTerbit: number;
  countDibatalkan: number;
}

/**
 * SPT Masa PPh — rekap bukti potong per jenis PPh per masa pajak.
 *
 * Format e-Bupot Unifikasi (PER-24/PJ/2021 + Coretax):
 *   - PPh 21: bulanan dari payroll
 *   - PPh 23: bulanan dari pembelian jasa
 *   - PPh 4(2): final (sewa, jasa konstruksi)
 */
@Injectable()
export class SptPphService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly excel: ExcelService,
  ) {}

  async exportXlsx(opts: { periodId: string; jenisPph: JenisPph }): Promise<Buffer> {
    const data = await this.build(opts);
    return this.excel.buildBuffer(
      `SPT ${data.jenisPph} ${data.periode.label}`,
      [
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor ?? '' },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Pihak', key: 'pihak', width: 28, value: (r) => r.pihakNama },
        { header: 'NPWP/NIK', key: 'npwp', width: 20, value: (r) => r.pihakNpwp ?? r.pihakNik ?? '' },
        { header: 'DPP', key: 'dpp', width: 16, format: 'currency', value: (r) => r.dpp },
        { header: 'Tarif %', key: 'tarif', width: 8, value: (r) => r.tarifPersen },
        { header: 'PPh', key: 'pph', width: 16, format: 'currency', value: (r) => r.pph },
        { header: 'Sumber', key: 'sumber', width: 20, value: (r) => r.sumberType ?? '' },
      ],
      data.rows,
    );
  }

  async build(opts: {
    periodId: string;
    jenisPph: JenisPph;
  }): Promise<SptPphResponse> {
    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: opts.periodId },
        select: { id: true, label: true, startDate: true, endDate: true },
      });
      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      const rows = await tx.buktiPotong.findMany({
        where: {
          fiscalPeriodId: opts.periodId,
          jenisPph: opts.jenisPph,
        },
        orderBy: { tanggal: 'asc' },
      });

      const terbit = rows.filter((r) => r.status !== BuktiPotongStatus.DIBATALKAN);

      const totalDpp = terbit.reduce(
        (a, r) => a.plus(new Decimal(r.dpp)),
        new Decimal(0),
      );
      const totalPph = terbit.reduce(
        (a, r) => a.plus(new Decimal(r.pph)),
        new Decimal(0),
      );

      return {
        periode: period,
        jenisPph: opts.jenisPph,
        rows: terbit.map((r) => ({
          nomor: r.nomor,
          tanggal: r.tanggal,
          pihakNama: r.pihakNama,
          pihakNpwp: r.pihakNpwp,
          pihakNik: r.pihakNik,
          dpp: r.dpp.toString(),
          tarifPersen: r.tarifPersen.toString(),
          pph: r.pph.toString(),
          sumberType: r.sumberType,
        })),
        totalDpp: totalDpp.toFixed(2),
        totalPph: totalPph.toFixed(2),
        countTerbit: terbit.length,
        countDibatalkan: rows.length - terbit.length,
      };
    });
  }
}
