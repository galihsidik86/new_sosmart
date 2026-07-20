import { Injectable } from '@nestjs/common';
import type { BulkFiskalAttributeInput } from '@lentera/shared/schemas';
import { AccountKind, FiskalKategori, FiskalTreatment } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';

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
  constructor(private readonly tenancy: TenancyService) {}

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
}
