import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AccountKind, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { aggregateAllAccounts, mutasiSigned, plKindContribution } from './helpers.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

export interface LabaRugiAccount {
  id: string;
  kode: string;
  nama: string;
  nilai: string;
  /// Analisa vertikal (% dari Total Pendapatan). Hanya terisi kalau vertikal=true.
  persenBase?: string;
  /// Analisa horizontal — nilai periode pembanding. Hanya kalau compareToPeriodId.
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}

export interface LabaRugiSection {
  rows: LabaRugiAccount[];
  total: string;
  persenBase?: string;
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}

export interface LabaRugiSubTotal {
  nilai: string;
  persenBase?: string;
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}

export interface LabaRugiResponse {
  periode: { id: string; label: string; startDate: Date; endDate: Date };
  /// Periode pembanding (kalau compareToPeriodId di-set).
  periodeCompare?: { id: string; label: string; startDate: Date; endDate: Date };
  pendapatan: LabaRugiSection;
  bebanPokok: LabaRugiSection;
  labaKotor: LabaRugiSubTotal;
  bebanOperasi: LabaRugiSection;
  labaUsaha: LabaRugiSubTotal;
  pendapatanLain: LabaRugiSection;
  bebanLain: LabaRugiSection;
  labaSebelumPajak: LabaRugiSubTotal;
  bebanPajak: LabaRugiSubTotal;
  labaBersih: LabaRugiSubTotal;
  /// True kalau vertikal aktif (persenBase terisi di semua row/total).
  vertikal: boolean;
  /// True kalau horizontal aktif (previous/delta terisi).
  horizontal: boolean;
  /// Identitas filter yang aktif (proyek / cabang) — dipakai di header cetak.
  filter?: {
    project?: { kode: string; nama: string };
    cabang?: { kode: string; nama: string };
  };
}

interface CoreCompute {
  periode: { id: string; label: string; startDate: Date; endDate: Date };
  rowsBySection: Record<AccountKind, LabaRugiAccount[]>;
  totals: {
    pendapatan: Decimal;
    bebanPokok: Decimal;
    bebanOperasi: Decimal;
    pendapatanLain: Decimal;
    bebanLain: Decimal;
    labaKotor: Decimal;
    labaUsaha: Decimal;
    labaSebelumPajak: Decimal;
    bebanPajak: Decimal;
    labaBersih: Decimal;
  };
}

/**
 * Laporan Laba Rugi (SAK ETAP).
 *
 * Format:
 *   Pendapatan Operasional             X
 *   (Beban Pokok Penjualan)           (X)
 *   Laba Kotor                         X
 *   (Beban Operasional)               (X)
 *   Laba Usaha                         X
 *   + Pendapatan Lain-lain             X
 *   − Beban Lain-lain                 (X)
 *   Laba Sebelum Pajak                 X
 *   (Beban PPh)                       (X)
 *   Laba Bersih                        X
 *
 * Analisa:
 *  - Vertikal: setiap baris & subtotal di-render sebagai % dari Total
 *    Pendapatan (base standar SAK/manajemen).
 *  - Horizontal: bandingkan dengan periode lain (compareToPeriodId), tampilkan
 *    delta absolut + persen.
 */
@Injectable()
export class LabaRugiService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async build(opts: {
    periodId: string;
    cabangId?: string;
    /// Optional: mode YTD (year-to-date). Default false = hanya periode tsb.
    ytd?: boolean;
    /// Filter per project. null → hanya tanpa project (overhead). undefined = semua.
    projectId?: string | null;
    /// Analisa vertikal (% dari Total Pendapatan).
    vertikal?: boolean;
    /// Analisa horizontal — id periode pembanding.
    compareToPeriodId?: string;
  }): Promise<LabaRugiResponse> {
    return this.tenancy.run(async (tx) => {
      const current = await this.computeCore(tx, {
        periodId: opts.periodId,
        cabangId: opts.cabangId,
        ytd: opts.ytd,
        projectId: opts.projectId,
      });
      const compare = opts.compareToPeriodId
        ? await this.computeCore(tx, {
            periodId: opts.compareToPeriodId,
            cabangId: opts.cabangId,
            ytd: opts.ytd,
            projectId: opts.projectId,
          })
        : null;
      const resp = this.assemble(current, compare, {
        vertikal: !!opts.vertikal,
        horizontal: !!compare,
      });

      // Identitas filter (proyek/cabang) untuk header cetak & tampilan.
      const filter: LabaRugiResponse['filter'] = {};
      if (typeof opts.projectId === 'string') {
        const p = await tx.project.findUnique({
          where: { id: opts.projectId },
          select: { kode: true, nama: true },
        });
        if (p) filter.project = p;
      } else if (opts.projectId === null) {
        filter.project = { kode: '-', nama: 'Tanpa proyek (overhead)' };
      }
      if (opts.cabangId) {
        const c = await tx.cabang.findUnique({
          where: { id: opts.cabangId },
          select: { kode: true, nama: true },
        });
        if (c) filter.cabang = c;
      }
      if (filter.project || filter.cabang) resp.filter = filter;
      return resp;
    });
  }

  // -----------------------------------------------------------
  // Core compute (untuk satu periode)
  // -----------------------------------------------------------
  private async computeCore(
    tx: Prisma.TransactionClient,
    opts: {
      periodId: string;
      cabangId?: string;
      ytd?: boolean;
      projectId?: string | null;
    },
  ): Promise<CoreCompute> {
    const period = await tx.fiscalPeriod.findUnique({
      where: { id: opts.periodId },
      select: {
        id: true, label: true, startDate: true, endDate: true,
        fiscalYearId: true,
      },
    });
    if (!period) throw new NotFoundException(`Periode ${opts.periodId} tidak ditemukan`);

    let startDate = period.startDate;
    if (opts.ytd) {
      const fy = await tx.fiscalYear.findUnique({
        where: { id: period.fiscalYearId },
        select: { startDate: true },
      });
      if (fy) startDate = fy.startDate;
    }

    if (opts.cabangId) this.cabangScope.assertAccess(opts.cabangId);
    const { accounts, mutasiByAcc } = await aggregateAllAccounts(tx, {
      startDate,
      endDate: period.endDate,
      cabangId: opts.cabangId,
      allowedCabangIds: this.cabangScope.cabangIdsForWhere(),
      projectId: opts.projectId,
      includeKinds: [
        AccountKind.PENDAPATAN,
        AccountKind.BEBAN_POKOK,
        AccountKind.BEBAN,
        AccountKind.PENDAPATAN_LAIN,
        AccountKind.BEBAN_LAIN,
      ],
    });

    const rowsBySection: Record<AccountKind, LabaRugiAccount[]> = {
      ASET: [], LIABILITAS: [], EKUITAS: [],
      PENDAPATAN: [], BEBAN_POKOK: [], BEBAN: [],
      PENDAPATAN_LAIN: [], BEBAN_LAIN: [],
    };
    const sub = {
      pendapatan: new Decimal(0),
      bebanPokok: new Decimal(0),
      bebanOperasi: new Decimal(0),
      pendapatanLain: new Decimal(0),
      bebanLain: new Decimal(0),
    };
    for (const acc of accounts.values()) {
      // plKindContribution: akun kontra (mis. Retur Penjualan kind=PENDAPATAN
      // tapi normalBalance=DEBIT) dibalik arahnya di sini — supaya baris ini
      // DAN subtotal di bawah (sub.pendapatan dst.) sama-sama benar (baris
      // kontra tampil negatif, konsisten dengan kontribusinya mengurangi total).
      const nilai = plKindContribution(acc, mutasiSigned(acc, mutasiByAcc.get(acc.id)));
      if (nilai.eq(0)) continue;
      rowsBySection[acc.kind]!.push({
        id: acc.id, kode: acc.kode, nama: acc.nama, nilai: nilai.toFixed(2),
      });
      if (acc.kind === AccountKind.PENDAPATAN) sub.pendapatan = sub.pendapatan.plus(nilai);
      else if (acc.kind === AccountKind.BEBAN_POKOK) sub.bebanPokok = sub.bebanPokok.plus(nilai);
      else if (acc.kind === AccountKind.BEBAN) sub.bebanOperasi = sub.bebanOperasi.plus(nilai);
      else if (acc.kind === AccountKind.PENDAPATAN_LAIN) sub.pendapatanLain = sub.pendapatanLain.plus(nilai);
      else if (acc.kind === AccountKind.BEBAN_LAIN) sub.bebanLain = sub.bebanLain.plus(nilai);
    }

    const labaKotor = sub.pendapatan.minus(sub.bebanPokok);
    const labaUsaha = labaKotor.minus(sub.bebanOperasi);
    const labaSebelumPajak = labaUsaha.plus(sub.pendapatanLain).minus(sub.bebanLain);
    const bebanPajak = new Decimal(0);
    const labaBersih = labaSebelumPajak.minus(bebanPajak);

    return {
      periode: {
        id: period.id, label: period.label,
        startDate, endDate: period.endDate,
      },
      rowsBySection,
      totals: {
        pendapatan: sub.pendapatan,
        bebanPokok: sub.bebanPokok,
        bebanOperasi: sub.bebanOperasi,
        pendapatanLain: sub.pendapatanLain,
        bebanLain: sub.bebanLain,
        labaKotor,
        labaUsaha,
        labaSebelumPajak,
        bebanPajak,
        labaBersih,
      },
    };
  }

  // -----------------------------------------------------------
  // Assemble response (apply vertical + horizontal)
  // -----------------------------------------------------------
  private assemble(
    current: CoreCompute,
    compare: CoreCompute | null,
    flags: { vertikal: boolean; horizontal: boolean },
  ): LabaRugiResponse {
    const base = current.totals.pendapatan;
    const sortByKode = (a: LabaRugiAccount, b: LabaRugiAccount) =>
      a.kode.localeCompare(b.kode);

    const decorateRow = (
      r: LabaRugiAccount,
      previousRow: LabaRugiAccount | undefined,
    ): LabaRugiAccount => {
      const out: LabaRugiAccount = { ...r };
      if (flags.vertikal) out.persenBase = pct(r.nilai, base);
      if (flags.horizontal) {
        const prev = previousRow?.nilai ?? '0';
        out.previous = prev;
        out.deltaAbs = delta(r.nilai, prev);
        out.deltaPersen = deltaPercent(r.nilai, prev);
      }
      return out;
    };

    const decorateSection = (
      rows: LabaRugiAccount[],
      total: Decimal,
      compareRows: LabaRugiAccount[] | undefined,
      compareTotal: Decimal | undefined,
    ): LabaRugiSection => {
      const compareByKode = new Map<string, LabaRugiAccount>(
        (compareRows ?? []).map((r) => [r.kode, r]),
      );
      const sortedRows = rows.sort(sortByKode).map((r) =>
        decorateRow(r, compareByKode.get(r.kode)),
      );
      const s: LabaRugiSection = {
        rows: sortedRows,
        total: total.toFixed(2),
      };
      if (flags.vertikal) s.persenBase = pct(s.total, base);
      if (flags.horizontal) {
        const prev = (compareTotal ?? new Decimal(0)).toFixed(2);
        s.previous = prev;
        s.deltaAbs = delta(s.total, prev);
        s.deltaPersen = deltaPercent(s.total, prev);
      }
      return s;
    };

    const decorateSub = (
      nilai: Decimal,
      comparePrev: Decimal | undefined,
    ): LabaRugiSubTotal => {
      const out: LabaRugiSubTotal = { nilai: nilai.toFixed(2) };
      if (flags.vertikal) out.persenBase = pct(out.nilai, base);
      if (flags.horizontal) {
        const prev = (comparePrev ?? new Decimal(0)).toFixed(2);
        out.previous = prev;
        out.deltaAbs = delta(out.nilai, prev);
        out.deltaPersen = deltaPercent(out.nilai, prev);
      }
      return out;
    };

    return {
      periode: current.periode,
      periodeCompare: compare?.periode,
      pendapatan: decorateSection(
        current.rowsBySection.PENDAPATAN,
        current.totals.pendapatan,
        compare?.rowsBySection.PENDAPATAN,
        compare?.totals.pendapatan,
      ),
      bebanPokok: decorateSection(
        current.rowsBySection.BEBAN_POKOK,
        current.totals.bebanPokok,
        compare?.rowsBySection.BEBAN_POKOK,
        compare?.totals.bebanPokok,
      ),
      labaKotor: decorateSub(current.totals.labaKotor, compare?.totals.labaKotor),
      bebanOperasi: decorateSection(
        current.rowsBySection.BEBAN,
        current.totals.bebanOperasi,
        compare?.rowsBySection.BEBAN,
        compare?.totals.bebanOperasi,
      ),
      labaUsaha: decorateSub(current.totals.labaUsaha, compare?.totals.labaUsaha),
      pendapatanLain: decorateSection(
        current.rowsBySection.PENDAPATAN_LAIN,
        current.totals.pendapatanLain,
        compare?.rowsBySection.PENDAPATAN_LAIN,
        compare?.totals.pendapatanLain,
      ),
      bebanLain: decorateSection(
        current.rowsBySection.BEBAN_LAIN,
        current.totals.bebanLain,
        compare?.rowsBySection.BEBAN_LAIN,
        compare?.totals.bebanLain,
      ),
      labaSebelumPajak: decorateSub(
        current.totals.labaSebelumPajak,
        compare?.totals.labaSebelumPajak,
      ),
      bebanPajak: decorateSub(current.totals.bebanPajak, compare?.totals.bebanPajak),
      labaBersih: decorateSub(current.totals.labaBersih, compare?.totals.labaBersih),
      vertikal: flags.vertikal,
      horizontal: flags.horizontal,
    };
  }
}

// ---------- helpers analisa ----------

function pct(nilai: string, base: Decimal): string {
  if (base.eq(0)) return '0.00';
  return new Decimal(nilai).div(base).mul(100).toFixed(2);
}
function delta(current: string, previous: string): string {
  return new Decimal(current).minus(new Decimal(previous)).toFixed(2);
}
function deltaPercent(current: string, previous: string): string {
  const prev = new Decimal(previous);
  if (prev.eq(0)) return new Decimal(current).eq(0) ? '0.00' : '999.99';
  return new Decimal(current).minus(prev).div(prev.abs()).mul(100).toFixed(2);
}
