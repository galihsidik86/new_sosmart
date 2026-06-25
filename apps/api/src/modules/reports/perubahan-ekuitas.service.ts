import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AccountKind } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { aggregateAllAccounts, mutasiSigned, saldoAkhirSigned } from './helpers.js';

export interface PerubahanEkuitasResponse {
  periode: { id: string; label: string; startDate: Date; endDate: Date };
  saldoAwal: { modal: string; saldoLaba: string; total: string };
  /// Penambahan modal periode (mutasi kredit 3-101).
  tambahanModal: string;
  /// Laba bersih periode (dari Laba Rugi).
  labaBersih: string;
  /// Dividen / Prive (mutasi debit 3-104).
  dividen: string;
  saldoAkhir: { modal: string; saldoLaba: string; total: string };
}

/**
 * Laporan Perubahan Ekuitas.
 *
 * Format:
 *   Saldo Awal (Modal + Saldo Laba)
 *   + Tambahan Modal Disetor periode
 *   + Laba Bersih periode
 *   − Dividen / Prive periode
 *   = Saldo Akhir
 *
 * Sumber data:
 *   - Saldo awal modal/saldo laba: saldoAwalAkun + Σ mutasi sebelum startDate
 *   - Tambahan modal: mutasi kredit akun 3-101 dalam periode
 *   - Laba bersih: agregasi PENDAPATAN−BEBAN dalam periode
 *   - Dividen: mutasi debit akun 3-104 dalam periode
 */
@Injectable()
export class PerubahanEkuitasService {
  constructor(private readonly tenancy: TenancyService) {}

  async build(opts: {
    periodId: string;
    cabangId?: string;
    ytd?: boolean;
  }): Promise<PerubahanEkuitasResponse> {
    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: opts.periodId },
        select: {
          id: true, label: true, startDate: true, endDate: true,
          fiscalYearId: true,
        },
      });
      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      let startDate = period.startDate;
      if (opts.ytd ?? true) {
        const fy = await tx.fiscalYear.findUnique({
          where: { id: period.fiscalYearId },
          select: { startDate: true },
        });
        if (fy) startDate = fy.startDate;
      }

      // Ekuitas
      const ekResult = await aggregateAllAccounts(tx, {
        startDate,
        endDate: period.endDate,
        cabangId: opts.cabangId,
        includeKinds: [AccountKind.EKUITAS],
      });

      const findByKode = (kode: string) =>
        [...ekResult.accounts.values()].find((a) => a.kode === kode);

      const modalAcc = findByKode('3-101');
      const saldoLabaAcc = findByKode('3-102');
      const dividenAcc = findByKode('3-104');

      const saldoAwalModal = modalAcc
        ? ekResult.signedSaldoAwalByAcc.get(modalAcc.id) ?? new Decimal(0)
        : new Decimal(0);
      const saldoAwalLaba = saldoLabaAcc
        ? ekResult.signedSaldoAwalByAcc.get(saldoLabaAcc.id) ?? new Decimal(0)
        : new Decimal(0);

      const tambahanModal = modalAcc
        ? mutasiSigned(modalAcc, ekResult.mutasiByAcc.get(modalAcc.id))
        : new Decimal(0);

      // Dividen: saldo normal akun 3-104 adalah DEBIT (kontra-ekuitas), mutasiSigned
      // mengembalikan positif kalau ada pembagian. Untuk laporan tampilkan sebagai
      // pengurang ekuitas.
      const dividen = dividenAcc
        ? mutasiSigned(dividenAcc, ekResult.mutasiByAcc.get(dividenAcc.id))
        : new Decimal(0);

      // Laba bersih periode (dari semua akun pendapatan & beban)
      const labaResult = await aggregateAllAccounts(tx, {
        startDate,
        endDate: period.endDate,
        cabangId: opts.cabangId,
        includeKinds: [
          AccountKind.PENDAPATAN,
          AccountKind.BEBAN_POKOK,
          AccountKind.BEBAN,
          AccountKind.PENDAPATAN_LAIN,
          AccountKind.BEBAN_LAIN,
        ],
      });
      let pendapatan = new Decimal(0);
      let beban = new Decimal(0);
      for (const acc of labaResult.accounts.values()) {
        const nilai = mutasiSigned(acc, labaResult.mutasiByAcc.get(acc.id));
        if (acc.kind === AccountKind.PENDAPATAN || acc.kind === AccountKind.PENDAPATAN_LAIN) {
          pendapatan = pendapatan.plus(nilai);
        } else {
          beban = beban.plus(nilai);
        }
      }
      const labaBersih = pendapatan.minus(beban);

      const saldoAkhirModal = saldoAwalModal.plus(tambahanModal);
      const saldoAkhirLaba = saldoAwalLaba.plus(labaBersih).minus(dividen);
      const saldoAwalTotal = saldoAwalModal.plus(saldoAwalLaba);
      const saldoAkhirTotal = saldoAkhirModal.plus(saldoAkhirLaba);

      return {
        periode: {
          id: period.id, label: period.label,
          startDate, endDate: period.endDate,
        },
        saldoAwal: {
          modal: saldoAwalModal.toFixed(2),
          saldoLaba: saldoAwalLaba.toFixed(2),
          total: saldoAwalTotal.toFixed(2),
        },
        tambahanModal: tambahanModal.toFixed(2),
        labaBersih: labaBersih.toFixed(2),
        dividen: dividen.toFixed(2),
        saldoAkhir: {
          modal: saldoAkhirModal.toFixed(2),
          saldoLaba: saldoAkhirLaba.toFixed(2),
          total: saldoAkhirTotal.toFixed(2),
        },
      };
    });
  }
}
