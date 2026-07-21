import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import type {
  BulkFiskalAttributeInput,
  CreateKoreksiFiskalInput,
  KompensasiInput,
  PphSettingInput,
  UpdateKoreksiFiskalInput,
} from '@lentera/shared/schemas';
import { hitungPphBadan, hitungPphBadan31E, hitungPphUmkmFinal } from '@lentera/shared';
import {
  AccountKind, FiskalKategori, FiskalTreatment, KoreksiBeda, KoreksiJenis,
  MetodePenyusutan, SkemaPphBadan,
} from '@lentera/db';
import type { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { aggregateAllAccounts, mutasiSigned, plKindContribution } from '../reports/helpers.js';

export interface KoreksiRow {
  sumber: 'OTOMATIS' | 'MANUAL';
  jenis: 'POSITIF' | 'NEGATIF';
  beda: 'TETAP' | 'SEMENTARA';
  kategori: string;
  deskripsi: string;
  akunKode: string | null;
  koreksi: string;
  id?: string;
}

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
      const r = await this.penyusutanTahunTx(tx, fy);
      return {
        fiscalYear: { id: fy.id, kode: fy.kode, startDate: fy.startDate, endDate: fy.endDate },
        rows: r.rows.map((x) => ({
          asetId: x.asetId, kode: x.kode, nama: x.nama, status: x.status,
          komersial: x.komersial.toFixed(2), fiskal: x.fiskal.toFixed(2), selisih: x.selisih.toFixed(2),
        })),
        totalKomersial: r.totalKomersial.toFixed(2),
        totalFiskal: r.totalFiskal.toFixed(2),
        totalSelisih: r.totalSelisih.toFixed(2),
      };
    });
  }

  private async penyusutanTahunTx(tx: Prisma.TransactionClient, fy: { id: string; startDate: Date; endDate: Date }) {
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
      return { asetId: a.id, kode: a.kode, nama: a.nama, status: a.status, komersial, fiskal, selisih: komersial.minus(fiskal) };
    });
    const totalKomersial = rows.reduce((s, r) => s.plus(r.komersial), new Decimal(0));
    const totalFiskal = rows.reduce((s, r) => s.plus(r.fiskal), new Decimal(0));
    return { rows, totalKomersial, totalFiskal, totalSelisih: totalKomersial.minus(totalFiskal) };
  }

  // ---------- Koreksi fiskal MANUAL ----------

  listKoreksi(fiscalYearId: string) {
    return this.tenancy.run((tx) =>
      tx.koreksiFiskal.findMany({ where: { fiscalYearId }, orderBy: { createdAt: 'asc' } }),
    );
  }

  createKoreksi(input: CreateKoreksiFiskalInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run((tx) =>
      tx.koreksiFiskal.create({
        data: {
          tenantId,
          fiscalYearId: input.fiscalYearId,
          jenis: input.jenis as KoreksiJenis,
          beda: input.beda as KoreksiBeda,
          kategori: input.kategori as FiskalKategori,
          deskripsi: input.deskripsi,
          akunId: input.akunId ?? null,
          koreksi: input.koreksi,
          sumber: 'MANUAL',
          catatan: input.catatan ?? null,
        },
      }),
    );
  }

  updateKoreksi(input: UpdateKoreksiFiskalInput) {
    const { id, ...rest } = input;
    const data: Prisma.KoreksiFiskalUpdateManyMutationInput = {};
    if (rest.jenis !== undefined) data.jenis = rest.jenis as KoreksiJenis;
    if (rest.beda !== undefined) data.beda = rest.beda as KoreksiBeda;
    if (rest.kategori !== undefined) data.kategori = rest.kategori as FiskalKategori;
    if (rest.deskripsi !== undefined) data.deskripsi = rest.deskripsi;
    if (rest.akunId !== undefined) data.akunId = rest.akunId ?? null;
    if (rest.koreksi !== undefined) data.koreksi = rest.koreksi;
    if (rest.catatan !== undefined) data.catatan = rest.catatan ?? null;
    return this.tenancy.run((tx) => tx.koreksiFiskal.updateMany({ where: { id }, data }));
  }

  deleteKoreksi(id: string) {
    return this.tenancy.run((tx) => tx.koreksiFiskal.deleteMany({ where: { id } }));
  }

  // ---------- Engine rekonsiliasi fiskal ----------

  /** Bangun worksheet rekonsiliasi fiskal + ringkasan PPh Badan untuk 1 tahun fiskal. */
  build(fiscalYearId: string) {
    return this.tenancy.run(async (tx) => {
      const fy = await tx.fiscalYear.findUnique({ where: { id: fiscalYearId } });
      if (!fy) throw new NotFoundException('Tahun fiskal tidak ditemukan');

      // 1. Agregasi P&L → laba komersial + nilai per akun.
      const agg = await aggregateAllAccounts(tx, {
        startDate: fy.startDate,
        endDate: fy.endDate,
        includeKinds: [
          AccountKind.PENDAPATAN, AccountKind.BEBAN_POKOK, AccountKind.BEBAN,
          AccountKind.PENDAPATAN_LAIN, AccountKind.BEBAN_LAIN,
        ],
      });
      let pendapatan = new Decimal(0), bebanPokok = new Decimal(0), beban = new Decimal(0);
      let pendapatanLain = new Decimal(0), bebanLain = new Decimal(0);
      const nilaiByAcc = new Map<string, Decimal>();
      for (const acc of agg.accounts.values()) {
        const nilai = plKindContribution(acc, mutasiSigned(acc, agg.mutasiByAcc.get(acc.id)));
        nilaiByAcc.set(acc.id, nilai);
        if (acc.kind === AccountKind.PENDAPATAN) pendapatan = pendapatan.plus(nilai);
        else if (acc.kind === AccountKind.BEBAN_POKOK) bebanPokok = bebanPokok.plus(nilai);
        else if (acc.kind === AccountKind.BEBAN) beban = beban.plus(nilai);
        else if (acc.kind === AccountKind.PENDAPATAN_LAIN) pendapatanLain = pendapatanLain.plus(nilai);
        else if (acc.kind === AccountKind.BEBAN_LAIN) bebanLain = bebanLain.plus(nilai);
      }
      const labaKomersial = pendapatan.minus(bebanPokok).minus(beban).plus(pendapatanLain).minus(bebanLain);

      const koreksi: KoreksiRow[] = [];

      // 2. Koreksi OTOMATIS dari atribut akun.
      const fiskalAccts = await tx.account.findMany({
        where: { fiskalTreatment: { not: FiskalTreatment.NONE }, kind: { in: FISKAL_KINDS } },
        select: { id: true, kode: true, nama: true, fiskalTreatment: true, fiskalPersen: true, fiskalKategori: true },
      });
      for (const fa of fiskalAccts) {
        const saldo = (nilaiByAcc.get(fa.id) ?? new Decimal(0)).abs();
        if (saldo.lte(0)) continue;
        let jenis: 'POSITIF' | 'NEGATIF' = 'POSITIF';
        let beda: 'TETAP' | 'SEMENTARA' = 'TETAP';
        let nilai = saldo;
        switch (fa.fiskalTreatment) {
          case FiskalTreatment.NON_DEDUCTIBLE: jenis = 'POSITIF'; break;
          case FiskalTreatment.CADANGAN: jenis = 'POSITIF'; beda = 'SEMENTARA'; break;
          case FiskalTreatment.PARTIAL: {
            const persen = new Decimal((fa.fiskalPersen as unknown as string) ?? '0');
            nilai = saldo.mul(new Decimal(100).minus(persen)).div(100);
            jenis = 'POSITIF';
            break;
          }
          case FiskalTreatment.FINAL_INCOME:
          case FiskalTreatment.NON_OBJECT: jenis = 'NEGATIF'; break;
          default: continue;
        }
        if (nilai.lte(0)) continue;
        koreksi.push({
          sumber: 'OTOMATIS', jenis, beda, kategori: fa.fiskalKategori ?? 'LAINNYA',
          deskripsi: fa.nama, akunKode: fa.kode, koreksi: nilai.toDecimalPlaces(2).toFixed(2),
        });
      }

      // 3. Koreksi penyusutan (komersial vs fiskal).
      const pen = await this.penyusutanTahunTx(tx, fy);
      if (!pen.totalSelisih.eq(0)) {
        koreksi.push({
          sumber: 'OTOMATIS',
          jenis: pen.totalSelisih.gte(0) ? 'POSITIF' : 'NEGATIF',
          beda: 'SEMENTARA', kategori: 'PENYUSUTAN',
          deskripsi: 'Selisih penyusutan komersial vs fiskal', akunKode: null,
          koreksi: pen.totalSelisih.abs().toFixed(2),
        });
      }

      // 4. Koreksi MANUAL.
      const manual = await tx.koreksiFiskal.findMany({ where: { fiscalYearId } });
      for (const m of manual) {
        koreksi.push({
          sumber: 'MANUAL', jenis: m.jenis, beda: m.beda, kategori: m.kategori,
          deskripsi: m.deskripsi, akunKode: null, koreksi: (m.koreksi as unknown as string), id: m.id,
        });
      }

      // 5. Total koreksi + laba fiskal.
      const totalPositif = koreksi.filter((k) => k.jenis === 'POSITIF').reduce((s, k) => s.plus(k.koreksi), new Decimal(0));
      const totalNegatif = koreksi.filter((k) => k.jenis === 'NEGATIF').reduce((s, k) => s.plus(k.koreksi), new Decimal(0));
      const labaFiskal = labaKomersial.plus(totalPositif).minus(totalNegatif);

      // 6. Kompensasi kerugian (dikap ≤ laba fiskal positif).
      const komItems = await tx.kompensasiKerugian.findMany({ where: { fiscalYearId }, orderBy: { tahunRugi: 'asc' } });
      const totalDipakaiRaw = komItems.reduce((s, k) => s.plus(k.dipakai as unknown as string), new Decimal(0));
      const kompensasiTerpakai = Decimal.max(0, Decimal.min(totalDipakaiRaw, Decimal.max(0, labaFiskal)));

      // 7. PKP (dibulatkan ribuan ke bawah, konvensi SPT).
      let pkp = Decimal.max(0, labaFiskal.minus(kompensasiTerpakai));
      pkp = pkp.div(1000).floor().mul(1000);

      // 8. PPh Badan.
      const setting = await tx.pphBadanSetting.findUnique({ where: { fiscalYearId } });
      const skema = (setting?.skema ?? SkemaPphBadan.BADAN_UMUM) as SkemaPphBadan;
      const tarif = new Decimal((setting?.tarif as unknown as string) ?? '22');
      const bruto = new Decimal((setting?.peredaranBruto as unknown as string) ?? '0');
      const use31E = setting?.useFasilitas31E ?? true;
      const kreditPajak = new Decimal((setting?.kreditPajakManual as unknown as string) ?? '0');
      const pphTerutang =
        skema === SkemaPphBadan.UMKM_FINAL
          ? hitungPphUmkmFinal(bruto)
          : use31E
            ? hitungPphBadan31E(pkp, bruto, tarif.toNumber())
            : hitungPphBadan(pkp, tarif.toNumber());
      const pphKurangBayar = new Decimal(pphTerutang.toString()).minus(kreditPajak);

      return {
        fiscalYear: { id: fy.id, kode: fy.kode, startDate: fy.startDate, endDate: fy.endDate },
        labaKomersial: labaKomersial.toFixed(2),
        komponenKomersial: {
          pendapatan: pendapatan.toFixed(2), bebanPokok: bebanPokok.toFixed(2), beban: beban.toFixed(2),
          pendapatanLain: pendapatanLain.toFixed(2), bebanLain: bebanLain.toFixed(2),
        },
        koreksi,
        totalKoreksiPositif: totalPositif.toFixed(2),
        totalKoreksiNegatif: totalNegatif.toFixed(2),
        labaFiskal: labaFiskal.toFixed(2),
        kompensasi: { items: komItems, terpakai: kompensasiTerpakai.toFixed(2) },
        pkp: pkp.toFixed(2),
        pph: {
          skema, tarif: tarif.toFixed(2), peredaranBruto: bruto.toFixed(2), useFasilitas31E: use31E,
          terutang: pphTerutang.toString(),
          kreditPajak: kreditPajak.toFixed(2),
          kurangBayar: pphKurangBayar.toFixed(2), // + = PPh 29 kurang bayar, − = PPh 28A lebih bayar
        },
      };
    });
  }
}
