import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AccountKind } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { aggregateAllAccounts, mutasiSigned } from './helpers.js';

export interface LabaRugiAccount {
  id: string;
  kode: string;
  nama: string;
  nilai: string;
}

export interface LabaRugiResponse {
  periode: { id: string; label: string; startDate: Date; endDate: Date };
  /// Pendapatan operasional (4-xxx)
  pendapatan: { rows: LabaRugiAccount[]; total: string };
  /// Beban Pokok Penjualan (5-xxx)
  bebanPokok: { rows: LabaRugiAccount[]; total: string };
  labaKotor: string;
  /// Beban Operasional (6-xxx)
  bebanOperasi: { rows: LabaRugiAccount[]; total: string };
  labaUsaha: string;
  /// Pendapatan Lain-lain (7-xxx)
  pendapatanLain: { rows: LabaRugiAccount[]; total: string };
  /// Beban Lain-lain (8-xxx)
  bebanLain: { rows: LabaRugiAccount[]; total: string };
  labaSebelumPajak: string;
  /// Beban PPh — diisi nol kalau belum ada estimasi.
  bebanPajak: string;
  labaBersih: string;
}

/**
 * Laporan Laba Rugi (SAK ETAP).
 *
 * Format:
 *   Pendapatan Operasional             X
 *   (Beban Pokok Penjualan)           (X)
 *   ────────────────────────────────────
 *   Laba Kotor                         X
 *   (Beban Operasional)               (X)
 *   ────────────────────────────────────
 *   Laba Usaha                         X
 *   + Pendapatan Lain-lain             X
 *   − Beban Lain-lain                 (X)
 *   ────────────────────────────────────
 *   Laba Sebelum Pajak                 X
 *   (Beban PPh)                       (X)
 *   ────────────────────────────────────
 *   Laba Bersih                        X
 *
 * Nilai mutasi periode = (kredit − debit) untuk PENDAPATAN (saldo normal kredit),
 * (debit − kredit) untuk BEBAN (saldo normal debit). Helper `mutasiSigned` handle.
 */
@Injectable()
export class LabaRugiService {
  constructor(private readonly tenancy: TenancyService) {}

  async build(opts: {
    periodId: string;
    cabangId?: string;
    /// Optional: mode YTD (year-to-date). Default false = hanya periode tsb.
    ytd?: boolean;
  }): Promise<LabaRugiResponse> {
    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: opts.periodId },
        select: {
          id: true, label: true, startDate: true, endDate: true,
          fiscalYearId: true,
        },
      });
      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      // Untuk YTD: ambil dari awal tahun buku.
      let startDate = period.startDate;
      if (opts.ytd) {
        const fy = await tx.fiscalYear.findUnique({
          where: { id: period.fiscalYearId },
          select: { startDate: true },
        });
        if (fy) startDate = fy.startDate;
      }

      const { accounts, mutasiByAcc } = await aggregateAllAccounts(tx, {
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

      const sectionsRaw: Record<AccountKind, LabaRugiAccount[]> = {
        ASET: [],
        LIABILITAS: [],
        EKUITAS: [],
        PENDAPATAN: [],
        BEBAN_POKOK: [],
        BEBAN: [],
        PENDAPATAN_LAIN: [],
        BEBAN_LAIN: [],
      };
      const totals: Record<AccountKind, Decimal> = {
        ASET: new Decimal(0), LIABILITAS: new Decimal(0), EKUITAS: new Decimal(0),
        PENDAPATAN: new Decimal(0), BEBAN_POKOK: new Decimal(0), BEBAN: new Decimal(0),
        PENDAPATAN_LAIN: new Decimal(0), BEBAN_LAIN: new Decimal(0),
      };

      for (const acc of accounts.values()) {
        const nilai = mutasiSigned(acc, mutasiByAcc.get(acc.id));
        if (nilai.eq(0)) continue;
        sectionsRaw[acc.kind]!.push({
          id: acc.id, kode: acc.kode, nama: acc.nama,
          nilai: nilai.toFixed(2),
        });
        totals[acc.kind] = totals[acc.kind]!.plus(nilai);
      }

      const pendapatan = totals.PENDAPATAN;
      const bebanPokok = totals.BEBAN_POKOK;
      const labaKotor = pendapatan.minus(bebanPokok);
      const bebanOp = totals.BEBAN;
      const labaUsaha = labaKotor.minus(bebanOp);
      const pendLain = totals.PENDAPATAN_LAIN;
      const bebanLain = totals.BEBAN_LAIN;
      const labaSebelumPajak = labaUsaha.plus(pendLain).minus(bebanLain);
      // Beban PPh dihitung di luar (manual entry untuk now); set 0.
      const bebanPajak = new Decimal(0);
      const labaBersih = labaSebelumPajak.minus(bebanPajak);

      return {
        periode: {
          id: period.id, label: period.label,
          startDate, endDate: period.endDate,
        },
        pendapatan: {
          rows: sectionsRaw.PENDAPATAN.sort((a, b) => a.kode.localeCompare(b.kode)),
          total: pendapatan.toFixed(2),
        },
        bebanPokok: {
          rows: sectionsRaw.BEBAN_POKOK.sort((a, b) => a.kode.localeCompare(b.kode)),
          total: bebanPokok.toFixed(2),
        },
        labaKotor: labaKotor.toFixed(2),
        bebanOperasi: {
          rows: sectionsRaw.BEBAN.sort((a, b) => a.kode.localeCompare(b.kode)),
          total: bebanOp.toFixed(2),
        },
        labaUsaha: labaUsaha.toFixed(2),
        pendapatanLain: {
          rows: sectionsRaw.PENDAPATAN_LAIN.sort((a, b) => a.kode.localeCompare(b.kode)),
          total: pendLain.toFixed(2),
        },
        bebanLain: {
          rows: sectionsRaw.BEBAN_LAIN.sort((a, b) => a.kode.localeCompare(b.kode)),
          total: bebanLain.toFixed(2),
        },
        labaSebelumPajak: labaSebelumPajak.toFixed(2),
        bebanPajak: bebanPajak.toFixed(2),
        labaBersih: labaBersih.toFixed(2),
      };
    });
  }
}
