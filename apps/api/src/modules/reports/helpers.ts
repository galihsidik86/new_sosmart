/**
 * Helper aggregate buat semua report.
 * Pakai 1 query groupBy(accountId) dengan filter periode/journal status,
 * lalu sign-correct sesuai normalBalance.
 */

import { Decimal } from 'decimal.js';
import {
  AccountKind,
  JournalStatus,
  NormalBalance,
  Prisma,
} from '@lentera/db';

export interface AggregatedAccount {
  id: string;
  kode: string;
  nama: string;
  kind: AccountKind;
  normalBalance: NormalBalance;
  parentId: string | null;
  saldoAwalAkun: Decimal;
  sumDebit: Decimal;
  sumKredit: Decimal;
}

/**
 * Agregasi mutasi semua akun untuk rentang tanggal (mis. periode laporan).
 *   - sebelum: include semua POSTED lines dengan tanggal < startDate
 *   - dalam:   include POSTED lines dengan startDate <= tanggal <= endDate
 * Kalau startDate null → sebelum=0, dalam=semua sampai endDate.
 */
export async function aggregateAllAccounts(
  tx: Prisma.TransactionClient,
  opts: {
    startDate?: Date;
    endDate: Date;
    cabangId?: string;
    includeKinds?: AccountKind[];
  },
): Promise<{
  signedSaldoAwalByAcc: Map<string, Decimal>;   // signed (saldo normal positif) di startDate-1
  mutasiByAcc: Map<string, { debit: Decimal; kredit: Decimal }>;
  accounts: Map<string, AggregatedAccount>;
}> {
  const accWhere: Prisma.AccountWhereInput = { isActive: true };
  if (opts.includeKinds && opts.includeKinds.length > 0) {
    accWhere.kind = { in: opts.includeKinds };
  }
  const accounts = await tx.account.findMany({
    where: accWhere,
    select: {
      id: true, kode: true, nama: true, kind: true,
      normalBalance: true, parentId: true, saldoAwal: true,
    },
    orderBy: { kode: 'asc' },
  });

  const accMap = new Map<string, AggregatedAccount>();
  for (const a of accounts) {
    accMap.set(a.id, {
      id: a.id, kode: a.kode, nama: a.nama, kind: a.kind,
      normalBalance: a.normalBalance, parentId: a.parentId,
      saldoAwalAkun: new Decimal(a.saldoAwal),
      sumDebit: new Decimal(0),
      sumKredit: new Decimal(0),
    });
  }

  const cabangFilter = opts.cabangId ? { cabangId: opts.cabangId } : {};

  // Sebelum periode (untuk saldo awal periode laporan).
  let sebelumMap = new Map<string, { d: Decimal; k: Decimal }>();
  if (opts.startDate) {
    const sebelum = await tx.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journal: {
          status: JournalStatus.POSTED,
          tanggal: { lt: opts.startDate },
          ...cabangFilter,
        },
      },
      _sum: { debit: true, kredit: true },
    });
    sebelumMap = new Map(
      sebelum.map((r) => [
        r.accountId,
        {
          d: new Decimal(r._sum.debit ?? 0),
          k: new Decimal(r._sum.kredit ?? 0),
        },
      ]),
    );
  }

  // Dalam periode (atau sampai endDate kalau startDate null).
  const dalamWhere: Prisma.JournalWhereInput = {
    status: JournalStatus.POSTED,
    tanggal: opts.startDate
      ? { gte: opts.startDate, lte: opts.endDate }
      : { lte: opts.endDate },
    ...cabangFilter,
  };
  const dalam = await tx.journalLine.groupBy({
    by: ['accountId'],
    where: { journal: dalamWhere },
    _sum: { debit: true, kredit: true },
  });
  const dalamMap = new Map(
    dalam.map((r) => [
      r.accountId,
      {
        debit: new Decimal(r._sum.debit ?? 0),
        kredit: new Decimal(r._sum.kredit ?? 0),
      },
    ]),
  );

  // Compute signed saldo awal periode (= saldoAwalAkun + mutasi sebelum, signed by normalBalance)
  const signedSaldoAwal = new Map<string, Decimal>();
  for (const acc of accMap.values()) {
    const sb = sebelumMap.get(acc.id);
    const mutSigned =
      acc.normalBalance === NormalBalance.DEBIT
        ? (sb?.d ?? new Decimal(0)).minus(sb?.k ?? new Decimal(0))
        : (sb?.k ?? new Decimal(0)).minus(sb?.d ?? new Decimal(0));
    signedSaldoAwal.set(acc.id, acc.saldoAwalAkun.plus(mutSigned));
  }

  return { signedSaldoAwalByAcc: signedSaldoAwal, mutasiByAcc: dalamMap, accounts: accMap };
}

/**
 * Hitung saldo akhir signed (saldo normal positif) untuk satu akun.
 */
export function saldoAkhirSigned(
  acc: AggregatedAccount,
  saldoAwalSigned: Decimal,
  mutasi: { debit: Decimal; kredit: Decimal } | undefined,
): Decimal {
  const mut = mutasi
    ? acc.normalBalance === NormalBalance.DEBIT
      ? mutasi.debit.minus(mutasi.kredit)
      : mutasi.kredit.minus(mutasi.debit)
    : new Decimal(0);
  return saldoAwalSigned.plus(mut);
}

/**
 * Sum mutasi periode untuk akun (signed = saldo normal positif).
 */
export function mutasiSigned(
  acc: AggregatedAccount,
  mutasi: { debit: Decimal; kredit: Decimal } | undefined,
): Decimal {
  if (!mutasi) return new Decimal(0);
  return acc.normalBalance === NormalBalance.DEBIT
    ? mutasi.debit.minus(mutasi.kredit)
    : mutasi.kredit.minus(mutasi.debit);
}
