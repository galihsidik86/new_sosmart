import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AccountKind, NormalBalance, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import {
  aggregateAllAccounts,
  saldoAkhirSigned,
  mutasiSigned,
  plKindContribution,
  klasifikasiAset,
  klasifikasiLiabilitas,
} from './helpers.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

export interface NeracaAccount {
  id: string;
  kode: string;
  nama: string;
  nilai: string;
  /// Vertikal — % dari Total Aset.
  persenBase?: string;
  /// Horizontal — periode pembanding.
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}

export interface NeracaSection {
  rows: NeracaAccount[];
  total: string;
  persenBase?: string;
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}

export interface NeracaSubTotal {
  nilai: string;
  persenBase?: string;
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}

export interface NeracaResponse {
  asOf: Date;
  periode: { id: string; label: string };
  periodeCompare?: { id: string; label: string; asOf: Date };
  asetLancar: NeracaSection;
  asetTetap: NeracaSection;
  totalAset: NeracaSubTotal;
  liabilitasJangkaPendek: NeracaSection;
  liabilitasJangkaPanjang: NeracaSection;
  totalLiabilitas: NeracaSubTotal;
  ekuitas: NeracaSection;
  labaBerjalan: NeracaSubTotal;
  totalEkuitas: NeracaSubTotal;
  totalLiabilitasEkuitas: NeracaSubTotal;
  balanced: boolean;
  selisih: string;
  vertikal: boolean;
  horizontal: boolean;
}

interface CoreCompute {
  periode: { id: string; label: string; endDate: Date };
  rows: {
    asetLancar: NeracaAccount[];
    asetTetap: NeracaAccount[];
    liabPendek: NeracaAccount[];
    liabPanjang: NeracaAccount[];
    ekuitas: NeracaAccount[];
  };
  totals: {
    asetLancar: Decimal;
    asetTetap: Decimal;
    liabPendek: Decimal;
    liabPanjang: Decimal;
    ekuitas: Decimal;
    labaBerjalan: Decimal;
    totalAset: Decimal;
    totalLiab: Decimal;
    totalEkuitas: Decimal;
    totalLE: Decimal;
    selisih: Decimal;
  };
  balanced: boolean;
}

/**
 * Laporan Neraca (Statement of Financial Position) per tanggal tertentu.
 * ASET = LIABILITAS + EKUITAS.
 *
 * Analisa:
 *  - Vertikal: % dari Total Aset (base standar untuk Neraca)
 *  - Horizontal: bandingkan dengan periode lain (compareToPeriodId)
 */
@Injectable()
export class NeracaService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async build(opts: {
    periodId: string;
    cabangId?: string;
    vertikal?: boolean;
    compareToPeriodId?: string;
  }): Promise<NeracaResponse> {
    if (!opts.periodId) throw new BadRequestException('Periode wajib dipilih');
    return this.tenancy.run(async (tx) => {
      const current = await this.computeCore(tx, opts.periodId, opts.cabangId);
      const compare = opts.compareToPeriodId
        ? await this.computeCore(tx, opts.compareToPeriodId, opts.cabangId)
        : null;
      return this.assemble(current, compare, {
        vertikal: !!opts.vertikal,
        horizontal: !!compare,
      });
    });
  }

  private async computeCore(
    tx: Prisma.TransactionClient,
    periodId: string,
    cabangId?: string,
  ): Promise<CoreCompute> {
    const period = await tx.fiscalPeriod.findUnique({
      where: { id: periodId },
      select: {
        id: true, label: true, endDate: true, fiscalYearId: true,
      },
    });
    if (!period) throw new NotFoundException(`Periode ${periodId} tidak ditemukan`);
    const fy = await tx.fiscalYear.findUnique({
      where: { id: period.fiscalYearId },
      select: { startDate: true },
    });
    if (!fy) throw new NotFoundException('Tahun buku tidak ditemukan');
    if (cabangId) this.cabangScope.assertAccess(cabangId);

    const balResult = await aggregateAllAccounts(tx, {
      endDate: period.endDate,
      cabangId,
      allowedCabangIds: this.cabangScope.cabangIdsForWhere(),
      includeKinds: [
        AccountKind.ASET,
        AccountKind.LIABILITAS,
        AccountKind.EKUITAS,
      ],
    });

    const rows = {
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
      const saldoRaw = saldoAkhirSigned(acc, saldoAwalSigned, balResult.mutasiByAcc.get(acc.id));
      // Koreksi akun KONTRA di neraca. `saldoAkhirSigned` mengembalikan nilai
      // positif ke arah normalBalance akun itu sendiri. Untuk akun kontra —
      // mis. Akumulasi Penyusutan (kind=ASET, normalBalance=KREDIT) atau
      // Dividen/Prive (kind=EKUITAS, normalBalance=DEBIT) — kontribusinya ke
      // seksi neraca harus DIBALIK supaya MENGURANGI (bukan menambah) totalnya.
      // Konsisten dengan plKindContribution() untuk laba rugi.
      const expectedNormal =
        acc.kind === AccountKind.ASET ? NormalBalance.DEBIT : NormalBalance.KREDIT;
      const saldo = acc.normalBalance === expectedNormal ? saldoRaw : saldoRaw.negated();
      if (saldo.eq(0)) continue;
      const row: NeracaAccount = {
        id: acc.id, kode: acc.kode, nama: acc.nama, nilai: saldo.toFixed(2),
      };
      if (acc.kind === AccountKind.ASET) {
        if (klasifikasiAset(acc) === 'TETAP') {
          rows.asetTetap.push(row);
          totals.asetTetap = totals.asetTetap.plus(saldo);
        } else {
          rows.asetLancar.push(row);
          totals.asetLancar = totals.asetLancar.plus(saldo);
        }
      } else if (acc.kind === AccountKind.LIABILITAS) {
        if (klasifikasiLiabilitas(acc) === 'PANJANG') {
          rows.liabPanjang.push(row);
          totals.liabPanjang = totals.liabPanjang.plus(saldo);
        } else {
          rows.liabPendek.push(row);
          totals.liabPendek = totals.liabPendek.plus(saldo);
        }
      } else if (acc.kind === AccountKind.EKUITAS) {
        rows.ekuitas.push(row);
        totals.ekuitas = totals.ekuitas.plus(saldo);
      }
    }

    // Laba berjalan tahun buku
    const labaResult = await aggregateAllAccounts(tx, {
      startDate: fy.startDate,
      endDate: period.endDate,
      cabangId,
      allowedCabangIds: this.cabangScope.cabangIdsForWhere(),
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
      // plKindContribution: koreksi arah untuk akun kontra (lihat helpers.ts).
      const nilai = plKindContribution(acc, mutasiSigned(acc, labaResult.mutasiByAcc.get(acc.id)));
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

    return {
      periode: { id: period.id, label: period.label, endDate: period.endDate },
      rows,
      totals: {
        ...totals,
        labaBerjalan,
        totalAset,
        totalLiab,
        totalEkuitas,
        totalLE,
        selisih,
      },
      balanced,
    };
  }

  private assemble(
    current: CoreCompute,
    compare: CoreCompute | null,
    flags: { vertikal: boolean; horizontal: boolean },
  ): NeracaResponse {
    const base = current.totals.totalAset;
    const sortByKode = (a: NeracaAccount, b: NeracaAccount) =>
      a.kode.localeCompare(b.kode);

    const decorateRow = (
      r: NeracaAccount,
      prev: NeracaAccount | undefined,
    ): NeracaAccount => {
      const out: NeracaAccount = { ...r };
      if (flags.vertikal) out.persenBase = pct(r.nilai, base);
      if (flags.horizontal) {
        const p = prev?.nilai ?? '0';
        out.previous = p;
        out.deltaAbs = delta(r.nilai, p);
        out.deltaPersen = deltaPercent(r.nilai, p);
      }
      return out;
    };

    const decorateSection = (
      rows: NeracaAccount[],
      total: Decimal,
      compareRows: NeracaAccount[] | undefined,
      compareTotal: Decimal | undefined,
    ): NeracaSection => {
      const compareByKode = new Map<string, NeracaAccount>(
        (compareRows ?? []).map((r) => [r.kode, r]),
      );
      const sorted = rows.sort(sortByKode).map((r) =>
        decorateRow(r, compareByKode.get(r.kode)),
      );
      const s: NeracaSection = { rows: sorted, total: total.toFixed(2) };
      if (flags.vertikal) s.persenBase = pct(s.total, base);
      if (flags.horizontal) {
        const p = (compareTotal ?? new Decimal(0)).toFixed(2);
        s.previous = p;
        s.deltaAbs = delta(s.total, p);
        s.deltaPersen = deltaPercent(s.total, p);
      }
      return s;
    };

    const decorateSub = (
      nilai: Decimal,
      comparePrev: Decimal | undefined,
    ): NeracaSubTotal => {
      const out: NeracaSubTotal = { nilai: nilai.toFixed(2) };
      if (flags.vertikal) out.persenBase = pct(out.nilai, base);
      if (flags.horizontal) {
        const p = (comparePrev ?? new Decimal(0)).toFixed(2);
        out.previous = p;
        out.deltaAbs = delta(out.nilai, p);
        out.deltaPersen = deltaPercent(out.nilai, p);
      }
      return out;
    };

    return {
      asOf: current.periode.endDate,
      periode: { id: current.periode.id, label: current.periode.label },
      periodeCompare: compare
        ? { id: compare.periode.id, label: compare.periode.label, asOf: compare.periode.endDate }
        : undefined,
      asetLancar: decorateSection(
        current.rows.asetLancar, current.totals.asetLancar,
        compare?.rows.asetLancar, compare?.totals.asetLancar,
      ),
      asetTetap: decorateSection(
        current.rows.asetTetap, current.totals.asetTetap,
        compare?.rows.asetTetap, compare?.totals.asetTetap,
      ),
      totalAset: decorateSub(current.totals.totalAset, compare?.totals.totalAset),
      liabilitasJangkaPendek: decorateSection(
        current.rows.liabPendek, current.totals.liabPendek,
        compare?.rows.liabPendek, compare?.totals.liabPendek,
      ),
      liabilitasJangkaPanjang: decorateSection(
        current.rows.liabPanjang, current.totals.liabPanjang,
        compare?.rows.liabPanjang, compare?.totals.liabPanjang,
      ),
      totalLiabilitas: decorateSub(current.totals.totalLiab, compare?.totals.totalLiab),
      ekuitas: decorateSection(
        current.rows.ekuitas, current.totals.ekuitas,
        compare?.rows.ekuitas, compare?.totals.ekuitas,
      ),
      labaBerjalan: decorateSub(current.totals.labaBerjalan, compare?.totals.labaBerjalan),
      totalEkuitas: decorateSub(current.totals.totalEkuitas, compare?.totals.totalEkuitas),
      totalLiabilitasEkuitas: decorateSub(current.totals.totalLE, compare?.totals.totalLE),
      balanced: current.balanced,
      selisih: current.totals.selisih.toFixed(2),
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
