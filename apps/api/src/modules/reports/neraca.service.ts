import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AccountKind } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { aggregateAllAccounts, saldoAkhirSigned, mutasiSigned } from './helpers.js';

export interface NeracaAccount {
  id: string;
  kode: string;
  nama: string;
  nilai: string;
}

export interface NeracaResponse {
  asOf: Date;
  periode: { id: string; label: string };
  /// ASET dipecah berdasar parent: Lancar (1-10*) dan Tetap (1-20*).
  asetLancar: { rows: NeracaAccount[]; total: string };
  asetTetap: { rows: NeracaAccount[]; total: string };
  totalAset: string;
  /// LIABILITAS dipecah jangka pendek (2-10*) & panjang (2-20*).
  liabilitasJangkaPendek: { rows: NeracaAccount[]; total: string };
  liabilitasJangkaPanjang: { rows: NeracaAccount[]; total: string };
  totalLiabilitas: string;
  ekuitas: { rows: NeracaAccount[]; total: string };
  /// Laba berjalan tahun buku — inject ke ekuitas supaya equation balanced.
  labaBerjalan: string;
  totalEkuitas: string;
  totalLiabilitasEkuitas: string;
  /// Validasi: Aset = Liabilitas + Ekuitas (toleransi 0.5 rupiah).
  balanced: boolean;
  selisih: string;
}

/**
 * Laporan Neraca (Statement of Financial Position) per tanggal tertentu.
 *
 * Persamaan akuntansi: ASET = LIABILITAS + EKUITAS.
 *
 * Strategi:
 *   1. Hitung saldo akhir semua akun ASET/LIABILITAS/EKUITAS s/d endDate
 *      = saldoAwalAkun + Σ mutasi POSTED s/d endDate (signed by normalBalance).
 *   2. Hitung laba berjalan = total mutasi PENDAPATAN/BEBAN dari awal tahun buku
 *      s/d endDate, lalu inject ke ekuitas (mewakili saldo laba tahun berjalan
 *      yang belum di-close ke retained earnings).
 *   3. Verify balanced.
 */
@Injectable()
export class NeracaService {
  constructor(private readonly tenancy: TenancyService) {}

  async build(opts: { periodId: string; cabangId?: string }): Promise<NeracaResponse> {
    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: opts.periodId },
        select: {
          id: true, label: true, endDate: true, fiscalYearId: true,
        },
      });
      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      const fy = await tx.fiscalYear.findUnique({
        where: { id: period.fiscalYearId },
        select: { startDate: true },
      });
      if (!fy) throw new NotFoundException('Tahun buku tidak ditemukan');

      // === 1. Saldo akhir ASET/LIABILITAS/EKUITAS s/d endDate ===
      const balResult = await aggregateAllAccounts(tx, {
        endDate: period.endDate,
        cabangId: opts.cabangId,
        includeKinds: [
          AccountKind.ASET,
          AccountKind.LIABILITAS,
          AccountKind.EKUITAS,
        ],
      });

      const sections = {
        asetLancar: [] as NeracaAccount[],
        asetTetap: [] as NeracaAccount[],
        liabPendek: [] as NeracaAccount[],
        liabPanjang: [] as NeracaAccount[],
        ekuitas: [] as NeracaAccount[],
      };
      const totals = {
        asetLancar: new Decimal(0),
        asetTetap: new Decimal(0),
        liabPendek: new Decimal(0),
        liabPanjang: new Decimal(0),
        ekuitas: new Decimal(0),
      };

      for (const acc of balResult.accounts.values()) {
        const saldoAwalSigned = balResult.signedSaldoAwalByAcc.get(acc.id) ?? new Decimal(0);
        const saldo = saldoAkhirSigned(acc, saldoAwalSigned, balResult.mutasiByAcc.get(acc.id));
        if (saldo.eq(0)) continue;
        const row: NeracaAccount = {
          id: acc.id, kode: acc.kode, nama: acc.nama, nilai: saldo.toFixed(2),
        };
        if (acc.kind === AccountKind.ASET) {
          // 1-10* = lancar, 1-20* = tetap
          if (acc.kode.startsWith('1-2')) {
            sections.asetTetap.push(row);
            totals.asetTetap = totals.asetTetap.plus(saldo);
          } else {
            sections.asetLancar.push(row);
            totals.asetLancar = totals.asetLancar.plus(saldo);
          }
        } else if (acc.kind === AccountKind.LIABILITAS) {
          if (acc.kode.startsWith('2-2')) {
            sections.liabPanjang.push(row);
            totals.liabPanjang = totals.liabPanjang.plus(saldo);
          } else {
            sections.liabPendek.push(row);
            totals.liabPendek = totals.liabPendek.plus(saldo);
          }
        } else if (acc.kind === AccountKind.EKUITAS) {
          sections.ekuitas.push(row);
          totals.ekuitas = totals.ekuitas.plus(saldo);
        }
      }

      // === 2. Laba berjalan tahun buku ===
      const labaResult = await aggregateAllAccounts(tx, {
        startDate: fy.startDate,
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
      const labaBerjalan = pendapatan.minus(beban);

      const totalAset = totals.asetLancar.plus(totals.asetTetap);
      const totalLiab = totals.liabPendek.plus(totals.liabPanjang);
      const totalEkuitas = totals.ekuitas.plus(labaBerjalan);
      const totalLE = totalLiab.plus(totalEkuitas);
      const selisih = totalAset.minus(totalLE);
      const balanced = selisih.abs().lte(new Decimal('0.5'));

      const sortByKode = (a: NeracaAccount, b: NeracaAccount) =>
        a.kode.localeCompare(b.kode);

      return {
        asOf: period.endDate,
        periode: { id: period.id, label: period.label },
        asetLancar: { rows: sections.asetLancar.sort(sortByKode), total: totals.asetLancar.toFixed(2) },
        asetTetap: { rows: sections.asetTetap.sort(sortByKode), total: totals.asetTetap.toFixed(2) },
        totalAset: totalAset.toFixed(2),
        liabilitasJangkaPendek: { rows: sections.liabPendek.sort(sortByKode), total: totals.liabPendek.toFixed(2) },
        liabilitasJangkaPanjang: { rows: sections.liabPanjang.sort(sortByKode), total: totals.liabPanjang.toFixed(2) },
        totalLiabilitas: totalLiab.toFixed(2),
        ekuitas: { rows: sections.ekuitas.sort(sortByKode), total: totals.ekuitas.toFixed(2) },
        labaBerjalan: labaBerjalan.toFixed(2),
        totalEkuitas: totalEkuitas.toFixed(2),
        totalLiabilitasEkuitas: totalLE.toFixed(2),
        balanced,
        selisih: selisih.toFixed(2),
      };
    });
  }
}
