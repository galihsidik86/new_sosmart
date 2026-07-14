/**
 * Helper aggregate buat semua report.
 * Pakai 1 query groupBy(accountId) dengan filter periode/journal status,
 * lalu sign-correct sesuai normalBalance.
 */

import { Decimal } from 'decimal.js';
import {
  AccountKind,
  KlasifikasiNeraca,
  NormalBalance,
  Prisma,
} from '@lentera/db';
import { deriveKlasifikasiNeraca } from '@lentera/shared/enums';
import { JOURNAL_BALANCE_STATUSES } from '../../common/gl/journal-balance-statuses.js';

export interface AggregatedAccount {
  id: string;
  kode: string;
  nama: string;
  kind: AccountKind;
  normalBalance: NormalBalance;
  parentId: string | null;
  saldoAwalAkun: Decimal;
  klasifikasiNeraca: KlasifikasiNeraca | null;
  isKasSetara: boolean;
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
    /** Single specific cabang. Kalau null/undefined dan `allowedCabangIds`
     *  juga undefined → semua cabang dalam tenant. */
    cabangId?: string;
    /** Restrict ke cabang yg di-allowlist (user multi-cabang restriction). */
    allowedCabangIds?: string[] | null;
    includeKinds?: AccountKind[];
    /**
     * Filter lines by projectId. 'null' berarti baris tanpa project (general/
     * overhead). undefined = semua project + tanpa project (default).
     */
    projectId?: string | null;
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
      klasifikasiNeraca: true, isKasSetara: true,
    },
    orderBy: { kode: 'asc' },
  });

  const accMap = new Map<string, AggregatedAccount>();
  for (const a of accounts) {
    accMap.set(a.id, {
      id: a.id, kode: a.kode, nama: a.nama, kind: a.kind,
      normalBalance: a.normalBalance, parentId: a.parentId,
      saldoAwalAkun: new Decimal(a.saldoAwal),
      klasifikasiNeraca: a.klasifikasiNeraca,
      isKasSetara: a.isKasSetara,
      sumDebit: new Decimal(0),
      sumKredit: new Decimal(0),
    });
  }

  const cabangFilter: { cabangId?: string | { in: string[] } } = opts.cabangId
    ? { cabangId: opts.cabangId }
    : opts.allowedCabangIds
      ? { cabangId: { in: opts.allowedCabangIds } }
      : {};
  // Filter per project: undefined → tanpa filter; string → project tertentu;
  // null → hanya baris tanpa project.
  const projectLineFilter: Prisma.JournalLineWhereInput =
    opts.projectId === undefined
      ? {}
      : opts.projectId === null
        ? { projectId: null }
        : { projectId: opts.projectId };

  // Sebelum periode (untuk saldo awal periode laporan).
  let sebelumMap = new Map<string, { d: Decimal; k: Decimal }>();
  if (opts.startDate) {
    const sebelum = await tx.journalLine.groupBy({
      by: ['accountId'],
      where: {
        ...projectLineFilter,
        journal: {
          status: { in: JOURNAL_BALANCE_STATUSES },
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
    status: { in: JOURNAL_BALANCE_STATUSES },
    tanggal: opts.startDate
      ? { gte: opts.startDate, lte: opts.endDate }
      : { lte: opts.endDate },
    ...cabangFilter,
  };
  const dalam = await tx.journalLine.groupBy({
    by: ['accountId'],
    where: { ...projectLineFilter, journal: dalamWhere },
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

  // Compute signed saldo awal periode (= saldoAwalAkun + mutasi sebelum, signed by normalBalance).
  // Note: kalau filter per project, saldoAwalAkun (opening balance akun) TIDAK
  // dimasukkan — itu saldo tenant-wide, bukan project-level.
  const includeAccountSaldoAwal = opts.projectId === undefined;
  const signedSaldoAwal = new Map<string, Decimal>();
  for (const acc of accMap.values()) {
    const sb = sebelumMap.get(acc.id);
    const mutSigned =
      acc.normalBalance === NormalBalance.DEBIT
        ? (sb?.d ?? new Decimal(0)).minus(sb?.k ?? new Decimal(0))
        : (sb?.k ?? new Decimal(0)).minus(sb?.d ?? new Decimal(0));
    signedSaldoAwal.set(
      acc.id,
      (includeAccountSaldoAwal ? acc.saldoAwalAkun : new Decimal(0)).plus(mutSigned),
    );
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
 * Klasifikasi neraca (lancar/tetap, jangka pendek/panjang).
 * Sumber utama: field `Account.klasifikasiNeraca` (data, ikut akun walau kode
 * ditata ulang). Fallback ke konvensi prefix HANYA kalau field masih null
 * (mis. data lama belum ter-backfill) — defensif, bukan jalur normal.
 */
export function klasifikasiAset(acc: {
  kode: string;
  klasifikasiNeraca: KlasifikasiNeraca | null;
}): 'LANCAR' | 'TETAP' {
  const k = acc.klasifikasiNeraca ?? deriveKlasifikasiNeraca('ASET', acc.kode);
  return k === 'ASET_TETAP' ? 'TETAP' : 'LANCAR';
}
export function klasifikasiLiabilitas(acc: {
  kode: string;
  klasifikasiNeraca: KlasifikasiNeraca | null;
}): 'PENDEK' | 'PANJANG' {
  const k =
    acc.klasifikasiNeraca ?? deriveKlasifikasiNeraca('LIABILITAS', acc.kode);
  return k === 'LIABILITAS_PANJANG' ? 'PANJANG' : 'PENDEK';
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

/**
 * Kontribusi akun ke bucket P&L per-kind (Pendapatan/Beban Pokok/Beban/
 * Pendapatan Lain/Beban Lain), sign-corrected untuk akun kontra.
 *
 * `nilai` (biasanya dari mutasiSigned) sudah positif ke arah normalBalance
 * akun ITU SENDIRI. Tapi `kind` menentukan arah "diharapkan" (Pendapatan* →
 * KREDIT, selain itu → DEBIT). Kalau normalBalance akun tidak cocok dengan
 * arah yang diharapkan untuk kind-nya (akun kontra, mis. Retur Penjualan
 * kind=PENDAPATAN tapi normalBalance=DEBIT), kontribusinya ke bucket harus
 * DIBALIK — supaya konsisten dengan FiscalYearClosingService.closeFiscalYear
 * (sign murni dari normalBalance, agnostic terhadap kind). Tanpa ini, akun
 * kontra ikut DITAMBAH ke bucket bukan DIKURANG — laba bersih jadi salah.
 */
export function plKindContribution(acc: AggregatedAccount, nilai: Decimal): Decimal {
  const expectedNormal =
    acc.kind === AccountKind.PENDAPATAN || acc.kind === AccountKind.PENDAPATAN_LAIN
      ? NormalBalance.KREDIT
      : NormalBalance.DEBIT;
  return acc.normalBalance === expectedNormal ? nilai : nilai.negated();
}
