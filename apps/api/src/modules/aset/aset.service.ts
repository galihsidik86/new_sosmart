import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  AsetStatus,
  JournalSource,
  KelompokAsetTetap,
  MetodePenyusutan,
  PeriodStatus,
  Prisma,
} from '@lentera/db';
import type { CreateAsetInput, DisposeAsetInput } from '@lentera/shared/schemas';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { JournalsService } from '../journals/journals.service.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

/**
 * Default masa manfaat (bulan) menurut Pasal 11 UU PPh:
 *   Bangunan Permanen   240 / NonPerm 120
 *   Kelompok I 48 / II 96 / III 192 / IV 240
 */
export const MASA_MANFAAT_DEFAULT: Record<KelompokAsetTetap, number> = {
  BANGUNAN_PERMANEN: 240,
  BANGUNAN_NON_PERMANEN: 120,
  KELOMPOK_I: 48,
  KELOMPOK_II: 96,
  KELOMPOK_III: 192,
  KELOMPOK_IV: 240,
};

@Injectable()
export class AsetService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly journals: JournalsService,
    private readonly glConfig: GlConfigService,
    private readonly excel: ExcelService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async exportXlsx(filter: { status?: AsetStatus; cabangId?: string }): Promise<Buffer> {
    const rows = await this.list(filter);
    return this.excel.buildBuffer(
      'Aset Tetap',
      [
        { header: 'Kode', key: 'kode', width: 14, value: (r) => r.kode },
        { header: 'Nama', key: 'nama', width: 32, value: (r) => r.nama },
        { header: 'Kelompok', key: 'kelompok', width: 18, value: (r) => r.kelompok },
        { header: 'Metode Penyusutan', key: 'metode', width: 18, value: (r) => r.metode },
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang?.kode ?? '' },
        { header: 'Tanggal Perolehan', key: 'tglPerolehan', width: 14, format: 'date', value: (r) => r.tanggalPerolehan },
        { header: 'Mulai Penyusutan', key: 'tglMulai', width: 14, format: 'date', value: (r) => r.mulaiPenyusutan },
        { header: 'Masa Manfaat (bln)', key: 'masa', width: 14, format: 'number', value: (r) => r.masaManfaatBulan },
        { header: 'Harga Perolehan', key: 'hp', width: 16, format: 'currency', value: (r) => r.hargaPerolehan },
        { header: 'Nilai Residu', key: 'residu', width: 14, format: 'currency', value: (r) => r.nilaiResidu },
        { header: 'Akumulasi', key: 'akum', width: 16, format: 'currency', value: (r) => r.akumulasiPenyusutan },
        { header: 'Nilai Buku', key: 'nb', width: 16, format: 'currency', value: (r) => r.nilaiBuku },
        { header: 'Akun Aset', key: 'akAset', width: 18, value: (r) => r.akunAset?.kode ?? '' },
        { header: 'Akun Akumulasi', key: 'akAkum', width: 18, value: (r) => r.akunAkumulasi?.kode ?? '' },
        { header: 'Akun Beban', key: 'akBeban', width: 18, value: (r) => r.akunBeban?.kode ?? '' },
        { header: 'Status', key: 'status', width: 12, value: (r) => r.status },
      ],
      rows,
    );
  }

  list(filter: { status?: AsetStatus; cabangId?: string }) {
    const where: Prisma.AsetTetapWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.cabangId) where.cabangId = filter.cabangId;
    return this.tenancy.run((tx) =>
      tx.asetTetap.findMany({
        where,
        orderBy: { kode: 'asc' },
        include: {
          cabang: { select: { kode: true, nama: true } },
          akunAset: { select: { kode: true, nama: true } },
          akunAkumulasi: { select: { kode: true, nama: true } },
          akunBeban: { select: { kode: true, nama: true } },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const a = await tx.asetTetap.findUnique({
        where: { id },
        include: {
          cabang: true,
          akunAset: true,
          akunAkumulasi: true,
          akunBeban: true,
          depresiasiLines: {
            orderBy: { run: { periode: 'asc' } },
            include: { run: { select: { periode: true, status: true, tanggal: true } } },
          },
        },
      });
      if (!a) throw new NotFoundException('Aset tidak ditemukan');
      this.cabangScope.assertAccess(a.cabangId);
      return a;
    });
  }

  async create(input: CreateAsetInput) {
    const tenantId = this.ctx.require().tenantId;
    this.cabangScope.assertAccess(input.cabangId);
    const userId = this.ctx.require().userId;
    const masa = input.masaManfaatBulan ?? MASA_MANFAAT_DEFAULT[input.kelompok];
    const perolehan = new Date(input.tanggalPerolehan + 'T00:00:00Z');
    const mulai = input.mulaiPenyusutan
      ? new Date(input.mulaiPenyusutan + 'T00:00:00Z')
      : new Date(Date.UTC(perolehan.getUTCFullYear(), perolehan.getUTCMonth() + 1, 1));

    const hp = new Decimal(input.hargaPerolehan);
    const akumAwal = new Decimal(input.akumulasiPenyusutan);
    if (akumAwal.gt(hp)) {
      throw new BadRequestException('Akumulasi awal tidak boleh > harga perolehan');
    }
    const nilaiBuku = hp.minus(akumAwal);

    return this.tenancy
      .run((tx) =>
        tx.asetTetap.create({
          data: {
            tenantId,
            cabangId: input.cabangId,
            kode: input.kode,
            nama: input.nama,
            kelompok: input.kelompok,
            metode: input.metode,
            tanggalPerolehan: perolehan,
            mulaiPenyusutan: mulai,
            hargaPerolehan: hp.toFixed(2),
            nilaiResidu: input.nilaiResidu,
            masaManfaatBulan: masa,
            akumulasiPenyusutan: akumAwal.toFixed(2),
            nilaiBuku: nilaiBuku.toFixed(2),
            lastDepresiasiPeriode: input.lastDepresiasiPeriode ?? null,
            akunAsetId: input.akunAsetId,
            akunAkumulasiId: input.akunAkumulasiId,
            akunBebanId: input.akunBebanId,
            catatan: input.catatan,
            createdById: userId,
          },
        }),
      )
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Kode aset sudah dipakai');
        }
        throw e;
      });
  }

  /**
   * Dispose aset — terbitkan jurnal penghentian dan set status DIJUAL/RUSAK/PENSIUN.
   *
   * Jurnal (untuk DIJUAL):
   *   D Kas/Bank           hargaJual
   *   D Akumulasi          akumulasiPenyusutan
   *   K Aset               hargaPerolehan
   *   D/K Laba/Rugi        selisih (kalau hargaJual > nilaiBuku → Laba 7-102 K; sebaliknya Rugi 8-103 D)
   *
   * Untuk RUSAK/PENSIUN (hargaJual = 0):
   *   D Akumulasi          akumulasiPenyusutan
   *   D Rugi 8-103         nilaiBuku
   *   K Aset               hargaPerolehan
   */
  async dispose(id: string, input: DisposeAsetInput) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const aset = await tx.asetTetap.findUnique({ where: { id } });
      if (!aset) throw new NotFoundException();
      // Lihat catatan di SalesService.updateDraft — RLS cuma isolasi tenant,
      // cabang belum dicek di jalur mutasi ini.
      this.cabangScope.assertAccess(aset.cabangId);
      if (aset.status !== AsetStatus.AKTIF) {
        throw new BadRequestException(`Aset sudah ${aset.status}, tidak bisa dispose lagi`);
      }
      const tanggal = new Date(input.tanggalDihentikan + 'T00:00:00Z');
      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');
      if (period.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException(`Periode ${period.label} sudah ditutup`);
      }

      const hp = new Decimal(aset.hargaPerolehan);
      const akum = new Decimal(aset.akumulasiPenyusutan);
      const nilaiBuku = new Decimal(aset.nilaiBuku);
      const hargaJual = new Decimal(input.hargaJual);

      // Lookup akun laba/rugi penjualan aset via GlConfig.
      const akunLabaJualId = await this.glConfig.getAccountIdInTx(tx, 'DISPOSAL_LABA');
      const akunRugiJualId = await this.glConfig.getAccountIdInTx(tx, 'DISPOSAL_RUGI');

      const lines: Array<{ accountId: string; debit: string; kredit: string; deskripsi?: string }> = [];

      if (input.statusBaru === 'DIJUAL') {
        if (!input.akunKasBankId) {
          throw new BadRequestException('DIJUAL butuh akunKasBankId untuk hasil penjualan');
        }
        const labaRugi = hargaJual.minus(nilaiBuku); // + = laba, - = rugi
        if (hargaJual.gt(0)) {
          lines.push({
            accountId: input.akunKasBankId,
            debit: hargaJual.toFixed(2),
            kredit: '0',
            deskripsi: `Penjualan aset ${aset.kode}`,
          });
        }
        if (akum.gt(0)) {
          lines.push({
            accountId: aset.akunAkumulasiId,
            debit: akum.toFixed(2),
            kredit: '0',
            deskripsi: 'Hapus akumulasi penyusutan',
          });
        }
        lines.push({
          accountId: aset.akunAsetId,
          debit: '0',
          kredit: hp.toFixed(2),
          deskripsi: 'Hapus aset',
        });
        if (labaRugi.gt(0)) {
          lines.push({
            accountId: akunLabaJualId,
            debit: '0',
            kredit: labaRugi.toFixed(2),
            deskripsi: 'Laba penjualan aset',
          });
        } else if (labaRugi.lt(0)) {
          lines.push({
            accountId: akunRugiJualId,
            debit: labaRugi.abs().toFixed(2),
            kredit: '0',
            deskripsi: 'Rugi penjualan aset',
          });
        }
      } else {
        // RUSAK/PENSIUN → write-off seluruh nilai buku ke rugi.
        if (akum.gt(0)) {
          lines.push({
            accountId: aset.akunAkumulasiId,
            debit: akum.toFixed(2),
            kredit: '0',
            deskripsi: 'Hapus akumulasi',
          });
        }
        if (nilaiBuku.gt(0)) {
          lines.push({
            accountId: akunRugiJualId,
            debit: nilaiBuku.toFixed(2),
            kredit: '0',
            deskripsi: `Rugi ${input.statusBaru.toLowerCase()} aset`,
          });
        }
        lines.push({
          accountId: aset.akunAsetId,
          debit: '0',
          kredit: hp.toFixed(2),
          deskripsi: 'Hapus aset',
        });
      }

      const journal = await this.journals.createDraftInTx(tx, {
        cabangId: aset.cabangId,
        tanggal: tanggal.toISOString().slice(0, 10),
        deskripsi: `Penghentian aset ${aset.kode} — ${aset.nama} (${input.statusBaru})`,
        sumber: JournalSource.PENYESUAIAN,
        sumberRef: aset.id,
        lines,
      });
      await this.journals.postInTx(tx, journal.id);

      return tx.asetTetap.update({
        where: { id },
        data: {
          status: input.statusBaru as AsetStatus,
          tanggalDihentikan: tanggal,
          hargaJualDisposal: hargaJual.toFixed(2),
          disposalJournalId: journal.id,
          // Setelah dispose: akumulasi & nilaiBuku tetap (snapshot terakhir), tapi tidak akan disusutkan lagi.
        },
      });
    });
  }

  /** Reverse dispose: hanya boleh dilakukan kalau periode jurnal masih OPEN. */
  async undispose(id: string, alasan: string) {
    return this.tenancy.run(async (tx) => {
      const aset = await tx.asetTetap.findUnique({ where: { id } });
      if (!aset) throw new NotFoundException();
      this.cabangScope.assertAccess(aset.cabangId);
      if (aset.status === AsetStatus.AKTIF) {
        throw new BadRequestException('Aset masih aktif');
      }
      if (aset.disposalJournalId) {
        await this.journals.reverseInTx(tx, aset.disposalJournalId, {
          alasan: `Reverse dispose ${aset.kode}: ${alasan}`,
        });
      }
      return tx.asetTetap.update({
        where: { id },
        data: {
          status: AsetStatus.AKTIF,
          tanggalDihentikan: null,
          hargaJualDisposal: null,
          disposalJournalId: null,
        },
      });
    });
  }
}
