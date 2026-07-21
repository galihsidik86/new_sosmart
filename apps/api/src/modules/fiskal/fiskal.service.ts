import { Injectable } from '@nestjs/common';
import type {
  BulkFiskalAttributeInput,
  KompensasiInput,
  PphSettingInput,
} from '@lentera/shared/schemas';
import { AccountKind, FiskalKategori, FiskalTreatment, SkemaPphBadan } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

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
}
