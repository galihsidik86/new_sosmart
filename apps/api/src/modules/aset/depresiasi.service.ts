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
  InvoiceStatus,
  JournalSource,
  MetodePenyusutan,
  PeriodStatus,
  Prisma,
} from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { JournalsService } from '../journals/journals.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';

/**
 * Engine penyusutan bulanan. Konvensi:
 *   - 1 run per (tenant, periode YYYY-MM).
 *   - Aset disusutkan hanya kalau status AKTIF dan mulaiPenyusutan <= akhir periode
 *     dan lastDepresiasiPeriode < periode (idempotent).
 *   - Garis lurus: (hargaPerolehan - nilaiResidu) / masaManfaatBulan, sampai nilai
 *     buku = nilaiResidu (cap bulan terakhir supaya tidak under-shoot).
 *   - Saldo menurun: tarif_bulanan = 2 / masaManfaatBulan, dikalikan nilai buku
 *     berjalan. Tahun terakhir: switch ke garis lurus dengan sisa nilai (geser
 *     sisa supaya nilai buku habis di bulan ke-N — disederhanakan: cap ke residu).
 */
@Injectable()
export class DepresiasiService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly journals: JournalsService,
    private readonly excel: ExcelService,
  ) {}

  async exportXlsx(): Promise<Buffer> {
    const rows = await this.list();
    return this.excel.buildBuffer(
      'Penyusutan Bulanan',
      [
        { header: 'Periode', key: 'periode', width: 12, value: (r) => r.periode },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Status', key: 'status', width: 12, value: (r) => r.status },
        { header: 'Total Aset', key: 'totalAset', width: 10, format: 'number', value: (r) => r._count.lines },
        { header: 'Total Penyusutan', key: 'totalNilai', width: 18, format: 'currency', value: (r) => r.totalPenyusutan },
      ],
      rows,
    );
  }

  // -----------------------------------------------------------
  // CALC
  // -----------------------------------------------------------

  /**
   * Hitung penyusutan bulanan untuk satu aset.
   * Return Decimal(0) kalau aset belum mulai disusutkan / sudah habis.
   */
  calc(aset: {
    metode: MetodePenyusutan;
    hargaPerolehan: Prisma.Decimal | string;
    nilaiResidu: Prisma.Decimal | string;
    masaManfaatBulan: number;
    akumulasiPenyusutan: Prisma.Decimal | string;
    nilaiBuku: Prisma.Decimal | string;
    mulaiPenyusutan: Date;
  }, periodeAkhir: Date): Decimal {
    if (periodeAkhir.getTime() < aset.mulaiPenyusutan.getTime()) {
      return new Decimal(0);
    }
    const hp = new Decimal(aset.hargaPerolehan as string);
    const residu = new Decimal(aset.nilaiResidu as string);
    const nilaiBuku = new Decimal(aset.nilaiBuku as string);

    if (nilaiBuku.lte(residu)) return new Decimal(0);

    let mvm: Decimal;
    if (aset.metode === MetodePenyusutan.GARIS_LURUS) {
      mvm = hp.minus(residu).div(aset.masaManfaatBulan).toDecimalPlaces(2);
    } else {
      // Saldo menurun: tarif_bulanan = 2/masaManfaatBulan * nilai buku berjalan.
      mvm = nilaiBuku.mul(2).div(aset.masaManfaatBulan).toDecimalPlaces(2);
    }
    // Cap supaya nilai buku tidak jatuh di bawah residu.
    const maxAllowed = nilaiBuku.minus(residu);
    if (mvm.gt(maxAllowed)) mvm = maxAllowed;
    if (mvm.lt(0)) mvm = new Decimal(0);
    return mvm;
  }

  // -----------------------------------------------------------
  // LIST / DETAIL
  // -----------------------------------------------------------

  list() {
    return this.tenancy.run((tx) =>
      tx.depresiasiRun.findMany({
        orderBy: { periode: 'desc' },
        include: { _count: { select: { lines: true } } },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const r = await tx.depresiasiRun.findUnique({
        where: { id },
        include: {
          fiscalPeriod: true,
          lines: {
            include: {
              aset: {
                select: {
                  id: true, kode: true, nama: true, kelompok: true,
                  metode: true, masaManfaatBulan: true,
                  cabang: { select: { kode: true } },
                  akunBeban: { select: { kode: true, nama: true } },
                  akunAkumulasi: { select: { kode: true, nama: true } },
                },
              },
            },
          },
        },
      });
      if (!r) throw new NotFoundException('Run tidak ditemukan');
      return r;
    });
  }

  /**
   * Preview: list aset yang akan disusutkan untuk periode tertentu beserta nilainya.
   * Tidak menulis ke DB.
   */
  preview(periode: string) {
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      throw new BadRequestException('Format periode YYYY-MM');
    }
    const [y, m] = periode.split('-').map(Number);
    const akhirBulan = new Date(Date.UTC(y!, m!, 0));

    return this.tenancy.run(async (tx) => {
      const asets = await tx.asetTetap.findMany({
        where: { status: AsetStatus.AKTIF },
        orderBy: { kode: 'asc' },
        include: { cabang: { select: { kode: true } } },
      });
      return asets
        .filter((a) => {
          if (a.mulaiPenyusutan > akhirBulan) return false;
          if (a.lastDepresiasiPeriode && a.lastDepresiasiPeriode >= periode) return false;
          return true;
        })
        .map((a) => {
          const nilai = this.calc(a, akhirBulan);
          return {
            asetId: a.id,
            kode: a.kode,
            nama: a.nama,
            cabangKode: a.cabang.kode,
            kelompok: a.kelompok,
            metode: a.metode,
            nilaiBukuSebelum: a.nilaiBuku,
            nilai: nilai.toFixed(2),
            akumulasiSesudah: new Decimal(a.akumulasiPenyusutan).plus(nilai).toFixed(2),
            nilaiBukuSesudah: new Decimal(a.nilaiBuku).minus(nilai).toFixed(2),
          };
        })
        .filter((r) => new Decimal(r.nilai).gt(0));
    });
  }

  // -----------------------------------------------------------
  // POST RUN
  // -----------------------------------------------------------

  async runAndPost(periode: string, tanggal?: Date) {
    const userId = this.ctx.require().userId;
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      throw new BadRequestException('Format periode YYYY-MM');
    }
    const [y, m] = periode.split('-').map(Number);
    const akhirBulan = new Date(Date.UTC(y!, m!, 0));
    const tgl = tanggal ?? akhirBulan;

    return this.tenancy.run(async (tx) => {
      const tenantId = this.ctx.require().tenantId;

      // Cek belum ada run untuk periode ini.
      const existing = await tx.depresiasiRun.findUnique({
        where: { tenantId_periode: { tenantId, periode } },
      });
      if (existing) {
        throw new ConflictException(
          `Run depresiasi untuk ${periode} sudah ada (${existing.status})`,
        );
      }

      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tgl }, endDate: { gte: tgl } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');
      if (period.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException(`Periode ${period.label} sudah ditutup`);
      }

      // Pilih aset aktif yang belum disusutkan untuk periode ini.
      const asets = await tx.asetTetap.findMany({
        where: { status: AsetStatus.AKTIF },
      });
      const eligible = asets.filter((a) => {
        if (a.mulaiPenyusutan > akhirBulan) return false;
        if (a.lastDepresiasiPeriode && a.lastDepresiasiPeriode >= periode) return false;
        return true;
      });

      if (eligible.length === 0) {
        throw new BadRequestException('Tidak ada aset yang perlu disusutkan untuk periode ini');
      }

      // Bangun lines + accumulate jurnal grouping.
      type LineData = {
        asetId: string; nilai: string;
        nilaiBukuSebelum: string; nilaiBukuSesudah: string; akumulasiSesudah: string;
      };
      const lineData: LineData[] = [];
      const bebanByAccount = new Map<string, Decimal>();
      const akumByAccount = new Map<string, Decimal>();
      let total = new Decimal(0);

      for (const a of eligible) {
        const nilai = this.calc(a, akhirBulan);
        if (nilai.lte(0)) continue;
        const bukuSebelum = new Decimal(a.nilaiBuku);
        const bukuSesudah = bukuSebelum.minus(nilai);
        const akumSesudah = new Decimal(a.akumulasiPenyusutan).plus(nilai);
        lineData.push({
          asetId: a.id,
          nilai: nilai.toFixed(2),
          nilaiBukuSebelum: bukuSebelum.toFixed(2),
          nilaiBukuSesudah: bukuSesudah.toFixed(2),
          akumulasiSesudah: akumSesudah.toFixed(2),
        });
        bebanByAccount.set(
          a.akunBebanId,
          (bebanByAccount.get(a.akunBebanId) ?? new Decimal(0)).plus(nilai),
        );
        akumByAccount.set(
          a.akunAkumulasiId,
          (akumByAccount.get(a.akunAkumulasiId) ?? new Decimal(0)).plus(nilai),
        );
        total = total.plus(nilai);
      }
      if (lineData.length === 0) {
        throw new BadRequestException('Semua aset sudah tersusutkan penuh — tidak ada yang dijurnal');
      }

      // Bangun jurnal.
      const lines: Array<{
        accountId: string; debit: string; kredit: string; deskripsi?: string;
      }> = [];
      for (const [aid, n] of bebanByAccount) {
        if (n.gt(0)) lines.push({ accountId: aid, debit: n.toFixed(2), kredit: '0', deskripsi: 'Beban penyusutan bulanan' });
      }
      for (const [aid, n] of akumByAccount) {
        if (n.gt(0)) lines.push({ accountId: aid, debit: '0', kredit: n.toFixed(2), deskripsi: 'Akumulasi penyusutan' });
      }

      // Cabang: pakai cabang dari aset pertama (dirty trick — sebaiknya per-cabang run).
      // Untuk Phase 6: gabung semua di cabang pertama aset eligible.
      const cabangId = eligible[0]!.cabangId;

      const journal = await this.journals.createDraftInTx(tx, {
        cabangId,
        tanggal: tgl.toISOString().slice(0, 10),
        deskripsi: `Penyusutan aset tetap ${periode}`,
        sumber: JournalSource.PENYUSUTAN,
        sumberRef: `DEP-${periode}`,
        lines,
      });
      await this.journals.postInTx(tx, journal.id);

      // Insert run + lines + update aset snapshots.
      const run = await tx.depresiasiRun.create({
        data: {
          tenantId,
          fiscalPeriodId: period.id,
          periode,
          tanggal: tgl,
          status: InvoiceStatus.POSTED,
          journalId: journal.id,
          totalPenyusutan: total.toFixed(2),
          postedAt: new Date(),
          postedById: userId,
          createdById: userId,
          lines: { create: lineData.map((l) => ({ tenantId, ...l })) },
        },
        include: { lines: true },
      });

      // Update aset.
      for (const l of lineData) {
        await tx.asetTetap.update({
          where: { id: l.asetId },
          data: {
            akumulasiPenyusutan: l.akumulasiSesudah,
            nilaiBuku: l.nilaiBukuSesudah,
            lastDepresiasiPeriode: periode,
          },
        });
      }
      return run;
    });
  }

  async cancel(id: string, alasan: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const run = await tx.depresiasiRun.findUnique({
        where: { id },
        include: { lines: { include: { aset: { select: { lastDepresiasiPeriode: true } } } } },
      });
      if (!run) throw new NotFoundException();
      if (run.status !== InvoiceStatus.POSTED) {
        throw new BadRequestException('Hanya run POSTED yang bisa dibatalkan');
      }
      // Hanya boleh cancel run TERAKHIR (chain rule — kalau ada run setelahnya, batalkan dulu).
      const newer = await tx.depresiasiRun.findFirst({
        where: { periode: { gt: run.periode }, status: InvoiceStatus.POSTED },
      });
      if (newer) {
        throw new BadRequestException(
          `Tidak bisa cancel ${run.periode}: ada run berikutnya (${newer.periode}). Cancel periode terakhir dulu.`,
        );
      }

      if (run.journalId) {
        await this.journals.reverseInTx(tx, run.journalId, {
          alasan: `Cancel depresiasi ${run.periode}: ${alasan}`,
        });
      }
      // Revert aset snapshots.
      for (const l of run.lines) {
        const aset = await tx.asetTetap.findUnique({ where: { id: l.asetId } });
        if (!aset) continue;
        const newAkum = new Decimal(aset.akumulasiPenyusutan).minus(new Decimal(l.nilai));
        const newBuku = new Decimal(aset.nilaiBuku).plus(new Decimal(l.nilai));
        // Cari periode sebelumnya untuk update lastDepresiasiPeriode.
        const prev = await tx.depresiasiLine.findFirst({
          where: {
            asetId: l.asetId,
            run: { status: InvoiceStatus.POSTED, periode: { lt: run.periode } },
          },
          orderBy: { run: { periode: 'desc' } },
          include: { run: { select: { periode: true } } },
        });
        await tx.asetTetap.update({
          where: { id: l.asetId },
          data: {
            akumulasiPenyusutan: newAkum.toFixed(2),
            nilaiBuku: newBuku.toFixed(2),
            lastDepresiasiPeriode: prev?.run.periode ?? null,
          },
        });
      }

      return tx.depresiasiRun.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
        },
      });
    });
  }
}
