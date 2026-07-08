import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AccountKind, NormalBalance } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';
import { JOURNAL_BALANCE_STATUSES } from '../../common/gl/journal-balance-statuses.js';

export interface TrialBalanceRow {
  accountId: string;
  kode: string;
  nama: string;
  kind: AccountKind;
  normalBalance: NormalBalance;
  /// Saldo awal periode dalam kolom debit/kredit (salah satu nol).
  saldoAwalDebit: string;
  saldoAwalKredit: string;
  /// Mutasi dalam periode.
  mutasiDebit: string;
  mutasiKredit: string;
  /// Saldo akhir periode dalam kolom debit/kredit (salah satu nol).
  saldoAkhirDebit: string;
  saldoAkhirKredit: string;
}

export interface TrialBalanceResponse {
  period: { id: string; label: string; startDate: Date; endDate: Date };
  rows: TrialBalanceRow[];
  totals: {
    saldoAwalDebit: string;
    saldoAwalKredit: string;
    mutasiDebit: string;
    mutasiKredit: string;
    saldoAkhirDebit: string;
    saldoAkhirKredit: string;
  };
  balanced: boolean;
}

@Injectable()
export class TrialBalanceService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async build(opts: {
    periodId: string;
    cabangId?: string;
    hideZero?: boolean;
    /// Filter per project. null = hanya tanpa project. undefined = semua.
    projectId?: string | null;
  }): Promise<TrialBalanceResponse> {
    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: opts.periodId },
        select: { id: true, label: true, startDate: true, endDate: true },
      });
      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      const accounts = await tx.account.findMany({
        where: { isPostable: true, isActive: true },
        orderBy: { kode: 'asc' },
        select: {
          id: true,
          kode: true,
          nama: true,
          kind: true,
          normalBalance: true,
          saldoAwal: true,
        },
      });

      let cabangFilter: { cabangId?: string | { in: string[] } } = {};
      if (opts.cabangId) {
        this.cabangScope.assertAccess(opts.cabangId);
        cabangFilter = { cabangId: opts.cabangId };
      } else {
        const scope = this.cabangScope.cabangIdsForWhere();
        if (scope) cabangFilter = { cabangId: { in: scope } };
      }

      const projectLineFilter: { projectId?: string | null } =
        opts.projectId === undefined
          ? {}
          : opts.projectId === null
            ? { projectId: null }
            : { projectId: opts.projectId };
      const includeAccountSaldoAwal = opts.projectId === undefined;

      // Group sums by account (sebelum periode & dalam periode) — 2 query agregat.
      const sebelum = await tx.journalLine.groupBy({
        by: ['accountId'],
        where: {
          ...projectLineFilter,
          journal: {
            status: { in: JOURNAL_BALANCE_STATUSES },
            tanggal: { lt: period.startDate },
            ...cabangFilter,
          },
        },
        _sum: { debit: true, kredit: true },
      });
      const sebelumMap = new Map(
        sebelum.map((r) => [
          r.accountId,
          {
            d: new Decimal(r._sum.debit ?? 0),
            k: new Decimal(r._sum.kredit ?? 0),
          },
        ]),
      );

      const dalam = await tx.journalLine.groupBy({
        by: ['accountId'],
        where: {
          ...projectLineFilter,
          journal: {
            status: { in: JOURNAL_BALANCE_STATUSES },
            tanggal: { gte: period.startDate, lte: period.endDate },
            ...cabangFilter,
          },
        },
        _sum: { debit: true, kredit: true },
      });
      const dalamMap = new Map(
        dalam.map((r) => [
          r.accountId,
          {
            d: new Decimal(r._sum.debit ?? 0),
            k: new Decimal(r._sum.kredit ?? 0),
          },
        ]),
      );

      let totals = {
        saldoAwalDebit: new Decimal(0),
        saldoAwalKredit: new Decimal(0),
        mutasiDebit: new Decimal(0),
        mutasiKredit: new Decimal(0),
        saldoAkhirDebit: new Decimal(0),
        saldoAkhirKredit: new Decimal(0),
      };

      const rows: TrialBalanceRow[] = [];

      for (const a of accounts) {
        // Kalau filter per project, saldo awal akun (tenant-level) tidak dihitung.
        const sa = includeAccountSaldoAwal ? new Decimal(a.saldoAwal) : new Decimal(0);
        const s = sebelumMap.get(a.id);
        const dl = dalamMap.get(a.id);

        // Saldo awal periode (signed normal)
        const awalSigned = signedNormal(
          a.normalBalance,
          sa,
          s?.d ?? new Decimal(0),
          s?.k ?? new Decimal(0),
        );

        const mutD = dl?.d ?? new Decimal(0);
        const mutK = dl?.k ?? new Decimal(0);
        const akhirSigned = awalSigned.plus(
          a.normalBalance === NormalBalance.DEBIT
            ? mutD.minus(mutK)
            : mutK.minus(mutD),
        );

        const [awalD, awalK] = splitToDebitKredit(a.normalBalance, awalSigned);
        const [akhD, akhK] = splitToDebitKredit(a.normalBalance, akhirSigned);

        const row: TrialBalanceRow = {
          accountId: a.id,
          kode: a.kode,
          nama: a.nama,
          kind: a.kind,
          normalBalance: a.normalBalance,
          saldoAwalDebit: awalD.toFixed(2),
          saldoAwalKredit: awalK.toFixed(2),
          mutasiDebit: mutD.toFixed(2),
          mutasiKredit: mutK.toFixed(2),
          saldoAkhirDebit: akhD.toFixed(2),
          saldoAkhirKredit: akhK.toFixed(2),
        };

        const isZero =
          awalD.eq(0) && awalK.eq(0) && mutD.eq(0) && mutK.eq(0) && akhD.eq(0) && akhK.eq(0);
        if (opts.hideZero && isZero) continue;

        totals.saldoAwalDebit = totals.saldoAwalDebit.plus(awalD);
        totals.saldoAwalKredit = totals.saldoAwalKredit.plus(awalK);
        totals.mutasiDebit = totals.mutasiDebit.plus(mutD);
        totals.mutasiKredit = totals.mutasiKredit.plus(mutK);
        totals.saldoAkhirDebit = totals.saldoAkhirDebit.plus(akhD);
        totals.saldoAkhirKredit = totals.saldoAkhirKredit.plus(akhK);

        rows.push(row);
      }

      const tot = {
        saldoAwalDebit: totals.saldoAwalDebit.toFixed(2),
        saldoAwalKredit: totals.saldoAwalKredit.toFixed(2),
        mutasiDebit: totals.mutasiDebit.toFixed(2),
        mutasiKredit: totals.mutasiKredit.toFixed(2),
        saldoAkhirDebit: totals.saldoAkhirDebit.toFixed(2),
        saldoAkhirKredit: totals.saldoAkhirKredit.toFixed(2),
      };

      return {
        period,
        rows,
        totals: tot,
        balanced: totals.mutasiDebit.eq(totals.mutasiKredit),
      };
    });
  }
}

/**
 * Hitung saldo awal periode (sebelum periode mulai), dikembalikan dalam
 * SIGNED VIEW (positif = saldo normal, negatif = abnormal/lawannya).
 *
 * saldoNormal = saldoAwalAkun + (Σdebit - Σkredit) untuk akun DEBIT-normal,
 *                                atau (Σkredit - Σdebit) untuk akun KREDIT-normal.
 */
function signedNormal(
  normal: NormalBalance,
  saldoAwalAkun: Decimal,
  sumD: Decimal,
  sumK: Decimal,
): Decimal {
  const mut = normal === NormalBalance.DEBIT ? sumD.minus(sumK) : sumK.minus(sumD);
  return saldoAwalAkun.plus(mut);
}

/**
 * Pecah saldo signed jadi pasangan (debit, kredit) kolom — salah satunya nol.
 * Saldo normal positif → masuk kolom sesuai normalBalance.
 * Saldo abnormal (negatif) → masuk kolom lawan, tanda positif.
 */
function splitToDebitKredit(
  normal: NormalBalance,
  signed: Decimal,
): [Decimal, Decimal] {
  if (signed.eq(0)) return [new Decimal(0), new Decimal(0)];
  if (signed.gt(0)) {
    return normal === NormalBalance.DEBIT
      ? [signed, new Decimal(0)]
      : [new Decimal(0), signed];
  }
  // abnormal
  const abs = signed.abs();
  return normal === NormalBalance.DEBIT
    ? [new Decimal(0), abs]
    : [abs, new Decimal(0)];
}
