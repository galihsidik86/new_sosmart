import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import type {
  BulkFiskalAttributeInput,
  KompensasiInput,
  PphSettingInput,
} from '@lentera/shared/schemas';
import {
  AccountKind, FiskalKategori, FiskalTreatment, MetodePenyusutan, SkemaPphBadan,
} from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

const ym = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const firstOfMonth = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonth = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

interface FiskalDepAset {
  hargaPerolehan: Decimal | string;
  metodeFiskal: MetodePenyusutan;
  masaManfaatFiskalBulan: number;
  nilaiResiduFiskal: Decimal | string;
  mulaiPenyusutan: Date;
  tanggalDihentikan: Date | null;
}

/// Kind akun yang relevan untuk perlakuan fiskal (beban & penghasilan).
const FISKAL_KINDS: AccountKind[] = [
  AccountKind.PENDAPATAN,
  AccountKind.PENDAPATAN_LAIN,
  AccountKind.BEBAN_POKOK,
  AccountKind.BEBAN,
  AccountKind.BEBAN_LAIN,
];

@Injectable()
export class FiskalService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  /** Daftar akun postable (beban/pendapatan) + atribut fiskalnya, untuk halaman pengaturan. */
  listAkunAttributes() {
    return this.tenancy.run((tx) =>
      tx.account.findMany({
        where: { isActive: true, isPostable: true, kind: { in: FISKAL_KINDS } },
        orderBy: { kode: 'asc' },
        select: {
          id: true,
          kode: true,
          nama: true,
          kind: true,
          fiskalTreatment: true,
          fiskalPersen: true,
          fiskalKategori: true,
        },
      }),
    );
  }

  /**
   * Set atribut fiskal beberapa akun sekaligus. Normalisasi:
   *  - persen hanya disimpan bila PARTIAL (selain itu null),
   *  - kategori dibuang bila NONE.
   * Update by id di dalam `tenancy.run` → RLS men-scope ke tenant aktif
   * (akun tenant lain tak akan cocok, count 0).
   */
  bulkSetAkunAttributes(input: BulkFiskalAttributeInput) {
    return this.tenancy.run(async (tx) => {
      let updated = 0;
      for (const it of input.items) {
        const treatment = it.fiskalTreatment as FiskalTreatment;
        const persenRaw = treatment === 'PARTIAL' ? it.fiskalPersen ?? null : null;
        const persen = persenRaw === '' ? null : persenRaw;
        const kategori =
          treatment === 'NONE' ? null : ((it.fiskalKategori ?? null) as FiskalKategori | null);

        const res = await tx.account.updateMany({
          where: { id: it.accountId },
          data: {
            fiskalTreatment: treatment,
            fiskalPersen: persen,
            fiskalKategori: kategori,
          },
        });
        updated += res.count;
      }
      return { updated };
    });
  }

  // ---------- Parameter PPh Badan per tahun fiskal ----------

  /** Ambil setting PPh untuk 1 tahun fiskal (null bila belum diatur). */
  getPphSetting(fiscalYearId: string) {
    return this.tenancy.run((tx) =>
      tx.pphBadanSetting.findUnique({ where: { fiscalYearId } }),
    );
  }

  upsertPphSetting(input: PphSettingInput) {
    const tenantId = this.ctx.require().tenantId;
    const data = {
      skema: input.skema as SkemaPphBadan,
      peredaranBruto: input.peredaranBruto,
      useFasilitas31E: input.useFasilitas31E,
      tarif: input.tarif,
      kreditPajakManual: input.kreditPajakManual,
    };
    return this.tenancy.run((tx) =>
      tx.pphBadanSetting.upsert({
        where: { fiscalYearId: input.fiscalYearId },
        create: { tenantId, fiscalYearId: input.fiscalYearId, ...data },
        update: data,
      }),
    );
  }

  // ---------- Kompensasi kerugian ----------

  getKompensasi(fiscalYearId: string) {
    return this.tenancy.run((tx) =>
      tx.kompensasiKerugian.findMany({
        where: { fiscalYearId },
        orderBy: { tahunRugi: 'asc' },
      }),
    );
  }

  /** Replace seluruh daftar kompensasi untuk 1 tahun fiskal. */
  upsertKompensasi(input: KompensasiInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      await tx.kompensasiKerugian.deleteMany({ where: { fiscalYearId: input.fiscalYearId } });
      if (input.items.length > 0) {
        await tx.kompensasiKerugian.createMany({
          data: input.items.map((it) => ({
            tenantId,
            fiscalYearId: input.fiscalYearId,
            tahunRugi: it.tahunRugi,
            nilaiRugi: it.nilaiRugi,
            dipakai: it.dipakai,
          })),
        });
      }
      return tx.kompensasiKerugian.findMany({
        where: { fiscalYearId: input.fiscalYearId },
        orderBy: { tahunRugi: 'asc' },
      });
    });
  }

  // ---------- Penyusutan fiskal vs komersial ----------

  /**
   * Simulasi penyusutan FISKAL yang jatuh dalam rentang [fyStart, fyEnd].
   * Fiskal report-only → tak ada history tersimpan; disimulasi bulan-per-bulan
   * dari mulaiPenyusutan (deterministik dari parameter statis aset).
   */
  private penyusutanFiskalSetahun(a: FiskalDepAset, fyStart: Date, fyEnd: Date): Decimal {
    const hp = new Decimal(a.hargaPerolehan as string);
    const residu = new Decimal(a.nilaiResiduFiskal as string);
    const masa = a.masaManfaatFiskalBulan || 1;
    const startM = firstOfMonth(fyStart);
    let endM = firstOfMonth(fyEnd);
    // Aset dilepas: penyusutan fiskal berhenti di bulan penghentian.
    if (a.tanggalDihentikan) {
      const stopM = firstOfMonth(a.tanggalDihentikan);
      if (stopM.getTime() < endM.getTime()) endM = stopM;
    }
    let buku = hp;
    let sum = new Decimal(0);
    let cur = firstOfMonth(a.mulaiPenyusutan);
    for (let guard = 0; cur.getTime() <= endM.getTime() && guard < 1200; guard++) {
      if (buku.lte(residu)) break;
      let mvm =
        a.metodeFiskal === MetodePenyusutan.GARIS_LURUS
          ? hp.minus(residu).div(masa).toDecimalPlaces(0)
          : buku.mul(2).div(masa).toDecimalPlaces(0);
      const maxAllowed = buku.minus(residu);
      if (mvm.gt(maxAllowed)) mvm = maxAllowed;
      if (mvm.lt(0)) mvm = new Decimal(0);
      buku = buku.minus(mvm);
      if (cur.getTime() >= startM.getTime() && cur.getTime() <= endM.getTime()) {
        sum = sum.plus(mvm);
      }
      cur = addMonth(cur);
    }
    return sum;
  }

  /** Perbandingan penyusutan komersial (dari DepresiasiLine POSTED) vs fiskal per aset, untuk 1 tahun fiskal. */
  penyusutanTahun(fiscalYearId: string) {
    return this.tenancy.run(async (tx) => {
      const fy = await tx.fiscalYear.findUnique({ where: { id: fiscalYearId } });
      if (!fy) throw new NotFoundException('Tahun fiskal tidak ditemukan');
      const startYM = ym(fy.startDate);
      const endYM = ym(fy.endDate);

      const aset = await tx.asetTetap.findMany({
        where: { mulaiPenyusutan: { lte: fy.endDate } },
        orderBy: { kode: 'asc' },
        select: {
          id: true, kode: true, nama: true, hargaPerolehan: true, mulaiPenyusutan: true,
          tanggalDihentikan: true, status: true,
          metodeFiskal: true, masaManfaatFiskalBulan: true, nilaiResiduFiskal: true,
        },
      });

      // Penyusutan komersial yang SUDAH diposting dalam tahun fiskal.
      const lines = await tx.depresiasiLine.findMany({
        where: { run: { status: 'POSTED', periode: { gte: startYM, lte: endYM } } },
        select: { asetId: true, nilai: true },
      });
      const komByAset = new Map<string, Decimal>();
      for (const l of lines) {
        komByAset.set(l.asetId, (komByAset.get(l.asetId) ?? new Decimal(0)).plus(l.nilai as unknown as string));
      }

      const rows = aset.map((a) => {
        const komersial = komByAset.get(a.id) ?? new Decimal(0);
        const fiskal = this.penyusutanFiskalSetahun(
          {
            hargaPerolehan: a.hargaPerolehan as unknown as string,
            metodeFiskal: a.metodeFiskal,
            masaManfaatFiskalBulan: a.masaManfaatFiskalBulan,
            nilaiResiduFiskal: a.nilaiResiduFiskal as unknown as string,
            mulaiPenyusutan: a.mulaiPenyusutan,
            tanggalDihentikan: a.tanggalDihentikan,
          },
          fy.startDate,
          fy.endDate,
        );
        return {
          asetId: a.id, kode: a.kode, nama: a.nama, status: a.status,
          komersial: komersial.toFixed(2),
          fiskal: fiskal.toFixed(2),
          selisih: komersial.minus(fiskal).toFixed(2), // + = komersial > fiskal → koreksi POSITIF
        };
      });

      const totKom = rows.reduce((s, r) => s.plus(r.komersial), new Decimal(0));
      const totFis = rows.reduce((s, r) => s.plus(r.fiskal), new Decimal(0));
      return {
        fiscalYear: { id: fy.id, kode: fy.kode, startDate: fy.startDate, endDate: fy.endDate },
        rows,
        totalKomersial: totKom.toFixed(2),
        totalFiskal: totFis.toFixed(2),
        totalSelisih: totKom.minus(totFis).toFixed(2),
      };
    });
  }
}
