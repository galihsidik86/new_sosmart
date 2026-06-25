import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { JournalStatus, NormalBalance } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';

export interface LedgerRow {
  tanggal: Date;
  nomor: string | null;
  deskripsi: string;
  /// Deskripsi baris (kalau diisi waktu jurnal); kalau tidak, pakai header.
  lineDeskripsi: string | null;
  cabangKode: string;
  debit: string;
  kredit: string;
  /// Saldo berjalan setelah baris ini (signed berdasar saldo normal akun).
  saldo: string;
}

export interface LedgerResponse {
  account: { id: string; kode: string; nama: string; normalBalance: NormalBalance };
  period: { id: string; label: string; startDate: Date; endDate: Date };
  saldoAwal: string;
  rows: LedgerRow[];
  totalDebit: string;
  totalKredit: string;
  saldoAkhir: string;
}

@Injectable()
export class LedgerService {
  constructor(private readonly tenancy: TenancyService) {}

  async buku(opts: {
    accountId: string;
    periodId?: string;
    cabangId?: string;
  }): Promise<LedgerResponse> {
    return this.tenancy.run(async (tx) => {
      const account = await tx.account.findUnique({
        where: { id: opts.accountId },
        select: {
          id: true,
          kode: true,
          nama: true,
          normalBalance: true,
          saldoAwal: true,
        },
      });
      if (!account) throw new NotFoundException('Akun tidak ditemukan');

      const period = opts.periodId
        ? await tx.fiscalPeriod.findUnique({
            where: { id: opts.periodId },
            select: { id: true, label: true, startDate: true, endDate: true },
          })
        : await tx.fiscalPeriod.findFirst({
            where: { status: 'OPEN' },
            orderBy: { startDate: 'asc' },
            select: { id: true, label: true, startDate: true, endDate: true },
          });
      if (!period) throw new NotFoundException('Periode tidak ditemukan / belum dibuat');

      const cabangFilter = opts.cabangId ? { cabangId: opts.cabangId } : {};

      // ---------- Saldo awal periode = saldoAwal akun + Σ posted lines sebelum period.startDate
      const sebelum = await tx.journalLine.aggregate({
        where: {
          accountId: account.id,
          journal: {
            status: JournalStatus.POSTED,
            tanggal: { lt: period.startDate },
            ...cabangFilter,
          },
        },
        _sum: { debit: true, kredit: true },
      });
      const signedAwal = applySign(
        account.normalBalance,
        new Decimal(account.saldoAwal),
      ).plus(
        applySign(
          account.normalBalance,
          new Decimal(sebelum._sum.debit ?? 0).minus(new Decimal(sebelum._sum.kredit ?? 0)),
          // line.debit - line.kredit selalu pakai sign DEBIT;
          // applySign akan flip kalau akun KREDIT-normal.
          true,
        ),
      );
      // Catatan: applySign(d-k, sign=true) → ke saldo normal:
      //   DEBIT-normal: tambah d-k (apa adanya)
      //   KREDIT-normal: tambah k-d → -(d-k)
      // Saldo awal akun (akun.saldoAwal) sudah ditulis positif di saldo normal.

      // ---------- Lines dalam periode
      const lines = await tx.journalLine.findMany({
        where: {
          accountId: account.id,
          journal: {
            status: JournalStatus.POSTED,
            tanggal: { gte: period.startDate, lte: period.endDate },
            ...cabangFilter,
          },
        },
        orderBy: [{ journal: { tanggal: 'asc' } }, { journal: { nomor: 'asc' } }, { no: 'asc' }],
        include: {
          journal: {
            select: {
              nomor: true,
              tanggal: true,
              deskripsi: true,
              cabang: { select: { kode: true } },
            },
          },
        },
      });

      let saldo = signedAwal;
      let totalDebit = new Decimal(0);
      let totalKredit = new Decimal(0);

      const rows: LedgerRow[] = [];
      for (const l of lines) {
        const d = new Decimal(l.debit);
        const k = new Decimal(l.kredit);
        totalDebit = totalDebit.plus(d);
        totalKredit = totalKredit.plus(k);
        saldo = saldo.plus(applySign(account.normalBalance, d.minus(k), true));
        rows.push({
          tanggal: l.journal.tanggal,
          nomor: l.journal.nomor,
          deskripsi: l.journal.deskripsi,
          lineDeskripsi: l.deskripsi,
          cabangKode: l.journal.cabang.kode,
          debit: d.toFixed(2),
          kredit: k.toFixed(2),
          saldo: saldo.toFixed(2),
        });
      }

      return {
        account: {
          id: account.id,
          kode: account.kode,
          nama: account.nama,
          normalBalance: account.normalBalance,
        },
        period,
        saldoAwal: signedAwal.toFixed(2),
        rows,
        totalDebit: totalDebit.toFixed(2),
        totalKredit: totalKredit.toFixed(2),
        saldoAkhir: saldo.toFixed(2),
      };
    });
  }
}

/**
 * Konversi angka ke saldo normal akun.
 *
 * - `isMutation = false`: angka diasumsi sudah sign saldo normal (mis. saldo awal).
 *   → return apa adanya, regardless of normal balance.
 * - `isMutation = true`: angka adalah `debit - kredit` (sign DEBIT-baseline).
 *   → kalau akun DEBIT-normal, kembalikan apa adanya.
 *   → kalau akun KREDIT-normal, flip tanda.
 */
function applySign(
  normal: NormalBalance,
  raw: Decimal,
  isMutation = false,
): Decimal {
  if (!isMutation) return raw;
  return normal === NormalBalance.DEBIT ? raw : raw.negated();
}
