import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  InvoiceStatus,
  JournalSource,
  PeriodStatus,
  Prisma,
  PtkpKategori,
  PtkpStatus,
} from '@lentera/db';
import type { CreatePayrollRunInput } from '@lentera/shared/schemas';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { lookupTer } from './ter-table.js';

/** Mapping PTKP status → kategori TER PMK 168/2023. */
const PTKP_TO_KATEGORI: Record<PtkpStatus, PtkpKategori> = {
  TK_0: PtkpKategori.A,
  TK_1: PtkpKategori.B, K_0: PtkpKategori.B, TK_2: PtkpKategori.B,
  TK_3: PtkpKategori.C, K_1: PtkpKategori.C, K_2: PtkpKategori.C, K_3: PtkpKategori.C,
  HB_0: PtkpKategori.C, HB_1: PtkpKategori.C, HB_2: PtkpKategori.C, HB_3: PtkpKategori.C,
};

@Injectable()
export class PayrollService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly seq: SequenceService,
    private readonly journals: JournalsService,
    private readonly glConfig: GlConfigService,
    private readonly excel: ExcelService,
  ) {}

  async exportXlsx(opts: { cabangId?: string; status?: InvoiceStatus }): Promise<Buffer> {
    const rows = await this.list(opts);
    return this.excel.buildBuffer(
      'Payroll',
      [
        { header: 'Periode', key: 'periode', width: 12, value: (r) => r.periode },
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor ?? '— DRAFT —' },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Cabang', key: 'cabang', width: 12, value: (r) => r.cabang.kode },
        { header: 'Status', key: 'status', width: 12, value: (r) => r.status },
        { header: 'Karyawan', key: 'jml', width: 10, format: 'number', value: (r) => r._count.lines },
        { header: 'Total Gaji Pokok', key: 'gaji', width: 16, format: 'currency', value: (r) => r.totalGajiPokok },
        { header: 'Total Tunjangan', key: 'tnj', width: 16, format: 'currency', value: (r) => r.totalTunjangan },
        { header: 'Total PPh 21', key: 'pph21', width: 14, format: 'currency', value: (r) => r.totalPph21 },
        { header: 'Total BPJS', key: 'bpjs', width: 14, format: 'currency', value: (r) => r.totalIuranBpjs },
        { header: 'Take Home', key: 'takehome', width: 16, format: 'currency', value: (r) => r.totalTakeHome },
      ],
      rows,
    );
  }

  list(opts: { cabangId?: string; status?: InvoiceStatus }) {
    const where: Prisma.PayrollRunWhereInput = {};
    if (opts.cabangId) where.cabangId = opts.cabangId;
    if (opts.status) where.status = opts.status;
    return this.tenancy.run((tx) =>
      tx.payrollRun.findMany({
        where,
        orderBy: [{ periode: 'desc' }, { createdAt: 'desc' }],
        include: {
          cabang: { select: { kode: true } },
          fiscalPeriod: { select: { label: true } },
          _count: { select: { lines: true } },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const r = await tx.payrollRun.findUnique({
        where: { id },
        include: {
          cabang: true,
          fiscalPeriod: true,
          lines: {
            orderBy: { no: 'asc' },
            include: {
              karyawan: {
                select: { kode: true, nama: true, jabatan: true, npwp: true, nik: true },
              },
            },
          },
        },
      });
      if (!r) throw new NotFoundException('Run payroll tidak ditemukan');
      return r;
    });
  }

  /**
   * Preview: tampilkan semua karyawan + perhitungan TER tanpa menulis DB.
   * Berguna untuk validasi sebelum POST.
   */
  preview(opts: { cabangId: string; periode: string; karyawanIds?: string[] }) {
    if (!/^\d{4}-\d{2}$/.test(opts.periode)) {
      throw new BadRequestException('Format periode YYYY-MM');
    }
    return this.tenancy.run(async (tx) => {
      const where: Prisma.KaryawanWhereInput = {
        isActive: true,
        cabangId: opts.cabangId,
      };
      if (opts.karyawanIds && opts.karyawanIds.length > 0) {
        where.id = { in: opts.karyawanIds };
      }
      const karyawan = await tx.karyawan.findMany({ where, orderBy: { kode: 'asc' } });
      return karyawan.map((k) => this.calcLine(k));
    });
  }

  private calcLine(k: {
    id: string; kode: string; nama: string; npwp: string | null;
    ptkpStatus: PtkpStatus;
    gajiPokok: Prisma.Decimal | string;
    tunjanganTetap: Prisma.Decimal | string;
    iuranBpjsKaryawan: Prisma.Decimal | string;
  }, overrides?: {
    gajiPokok?: string; tunjangan?: string;
    iuranBpjs?: string; potonganLain?: string;
  }) {
    const gajiPokok = new Decimal(overrides?.gajiPokok ?? (k.gajiPokok as string));
    const tunjangan = new Decimal(overrides?.tunjangan ?? (k.tunjanganTetap as string));
    const iuranBpjs = new Decimal(overrides?.iuranBpjs ?? (k.iuranBpjsKaryawan as string));
    const potonganLain = new Decimal(overrides?.potonganLain ?? '0');
    const bruto = gajiPokok.plus(tunjangan);

    const kategori = PTKP_TO_KATEGORI[k.ptkpStatus];
    let tarif = lookupTer(kategori, bruto.toNumber());
    // Tanpa NPWP → surcharge 20% (PPh 21 tarif jadi 1.2× tarif normal).
    if (!k.npwp) tarif = tarif * 1.2;
    const pph21 = bruto.mul(tarif).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
    const takeHome = bruto.minus(pph21).minus(iuranBpjs).minus(potonganLain);

    return {
      karyawanId: k.id,
      kode: k.kode,
      nama: k.nama,
      ptkpStatus: k.ptkpStatus,
      ptkpKategori: kategori,
      npwp: k.npwp,
      gajiPokok: gajiPokok.toFixed(2),
      tunjangan: tunjangan.toFixed(2),
      bruto: bruto.toFixed(2),
      tarifTerPersen: tarif.toFixed(4),
      pph21: pph21.toFixed(2),
      iuranBpjs: iuranBpjs.toFixed(2),
      potonganLain: potonganLain.toFixed(2),
      takeHome: takeHome.toFixed(2),
    };
  }

  async createDraft(input: CreatePayrollRunInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    if (!/^\d{4}-\d{2}$/.test(input.periode)) {
      throw new BadRequestException('Format periode YYYY-MM');
    }
    const [y, m] = input.periode.split('-').map(Number);
    const akhirBulan = new Date(Date.UTC(y!, m!, 0));
    const tgl = input.tanggal ? new Date(input.tanggal + 'T00:00:00Z') : akhirBulan;

    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tgl }, endDate: { gte: tgl } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');
      if (period.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException(`Periode ${period.label} sudah ditutup`);
      }

      // Cek belum ada run untuk (tenant, cabang, periode).
      const existing = await tx.payrollRun.findUnique({
        where: {
          tenantId_cabangId_periode: {
            tenantId, cabangId: input.cabangId, periode: input.periode,
          },
        },
      });
      if (existing) {
        throw new ConflictException(
          `Run payroll untuk ${input.periode} cabang ini sudah ada (${existing.status})`,
        );
      }

      const where: Prisma.KaryawanWhereInput = {
        isActive: true,
        cabangId: input.cabangId,
      };
      if (input.karyawanIds && input.karyawanIds.length > 0) {
        where.id = { in: input.karyawanIds };
      }
      const karyawan = await tx.karyawan.findMany({ where, orderBy: { kode: 'asc' } });
      if (karyawan.length === 0) {
        throw new BadRequestException('Tidak ada karyawan aktif di cabang ini');
      }

      const overrideMap = new Map(input.overrides.map((o) => [o.karyawanId, o]));

      const linesData: Array<{
        no: number; karyawanId: string;
        namaSnapshot: string; npwpSnapshot: string | null;
        ptkpStatusSnapshot: PtkpStatus; ptkpKategori: PtkpKategori;
        gajiPokok: string; tunjangan: string; bruto: string;
        tarifTerPersen: string; pph21: string;
        iuranBpjs: string; potonganLain: string; takeHome: string;
      }> = [];
      let totalGaji = new Decimal(0);
      let totalTunjangan = new Decimal(0);
      let totalBpjs = new Decimal(0);
      let totalPph21 = new Decimal(0);
      let totalTakeHome = new Decimal(0);

      for (let i = 0; i < karyawan.length; i++) {
        const k = karyawan[i]!;
        const ov = overrideMap.get(k.id);
        const c = this.calcLine(k, ov);
        linesData.push({
          no: i + 1,
          karyawanId: k.id,
          namaSnapshot: k.nama,
          npwpSnapshot: k.npwp,
          ptkpStatusSnapshot: k.ptkpStatus,
          ptkpKategori: c.ptkpKategori,
          gajiPokok: c.gajiPokok,
          tunjangan: c.tunjangan,
          bruto: c.bruto,
          tarifTerPersen: c.tarifTerPersen,
          pph21: c.pph21,
          iuranBpjs: c.iuranBpjs,
          potonganLain: c.potonganLain,
          takeHome: c.takeHome,
        });
        totalGaji = totalGaji.plus(c.gajiPokok);
        totalTunjangan = totalTunjangan.plus(c.tunjangan);
        totalBpjs = totalBpjs.plus(c.iuranBpjs);
        totalPph21 = totalPph21.plus(c.pph21);
        totalTakeHome = totalTakeHome.plus(c.takeHome);
      }

      return tx.payrollRun.create({
        data: {
          tenantId,
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          periode: input.periode,
          tanggal: tgl,
          status: InvoiceStatus.DRAFT,
          totalGajiPokok: totalGaji.toFixed(2),
          totalTunjangan: totalTunjangan.toFixed(2),
          totalIuranBpjs: totalBpjs.toFixed(2),
          totalPph21: totalPph21.toFixed(2),
          totalTakeHome: totalTakeHome.toFixed(2),
          akunKasBankId: input.akunKasBankId,
          createdById: userId,
          lines: { create: linesData.map((l) => ({ tenantId, ...l })) },
        },
        include: { lines: true },
      });
    });
  }

  async post(id: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const run = await tx.payrollRun.findUnique({
        where: { id },
        include: { lines: { include: { karyawan: { select: { nama: true } } } } },
      });
      if (!run) throw new NotFoundException();
      if (run.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(`Status ${run.status}`);
      }

      const nomor = run.nomor ?? (await this.seq.next(tx, 'PR', run.tanggal));

      // Resolve akun via GlConfig (override per tenant, fallback ke kode default).
      const akunBebanGajiId = await this.glConfig.getAccountIdInTx(tx, 'BEBAN_GAJI');
      const akunUtangPph21Id = await this.glConfig.getAccountIdInTx(tx, 'UTANG_PPH21');
      const akunUtangBpjsId = await this.glConfig.getAccountIdInTx(tx, 'UTANG_BPJS');

      const totalGaji = new Decimal(run.totalGajiPokok)
        .plus(new Decimal(run.totalTunjangan));
      const totalPph21 = new Decimal(run.totalPph21);
      const totalBpjs = new Decimal(run.totalIuranBpjs);
      const totalTakeHome = new Decimal(run.totalTakeHome);

      const lines: Array<{ accountId: string; debit: string; kredit: string; deskripsi?: string }> = [];
      // D Beban Gaji (total gaji + tunjangan = sebelum potongan)
      lines.push({
        accountId: akunBebanGajiId,
        debit: totalGaji.toFixed(2),
        kredit: '0',
        deskripsi: `Beban gaji ${run.periode}`,
      });
      // K Utang PPh 21
      if (totalPph21.gt(0)) {
        lines.push({
          accountId: akunUtangPph21Id,
          debit: '0',
          kredit: totalPph21.toFixed(2),
          deskripsi: 'PPh 21 dipotong karyawan',
        });
      }
      // K Utang BPJS
      if (totalBpjs.gt(0)) {
        lines.push({
          accountId: akunUtangBpjsId,
          debit: '0',
          kredit: totalBpjs.toFixed(2),
          deskripsi: 'BPJS karyawan dipotong',
        });
      }
      // K Kas/Bank (take-home)
      lines.push({
        accountId: run.akunKasBankId,
        debit: '0',
        kredit: totalTakeHome.toFixed(2),
        deskripsi: `Transfer gaji ${run.periode}`,
      });

      const journal = await this.journals.createDraftInTx(tx, {
        cabangId: run.cabangId,
        tanggal: run.tanggal.toISOString().slice(0, 10),
        deskripsi: `Payroll ${nomor} (${run.periode})`,
        sumber: JournalSource.PAJAK,
        sumberRef: run.id,
        lines,
      });
      await this.journals.postInTx(tx, journal.id);

      // Buat BuktiPotong PPh 21 per karyawan (untuk SPT Masa).
      for (const l of run.lines) {
        const pph21 = new Decimal(l.pph21);
        if (pph21.lte(0)) continue;
        const noBupot = await this.seq.next(tx, 'BP21', run.tanggal);
        await tx.buktiPotong.create({
          data: {
            tenantId: run.tenantId,
            cabangId: run.cabangId,
            fiscalPeriodId: run.fiscalPeriodId,
            jenisPph: 'PPH_21',
            nomor: noBupot,
            tanggal: run.tanggal,
            status: 'TERBIT',
            pihakNama: l.namaSnapshot,
            pihakNpwp: l.npwpSnapshot,
            dpp: l.bruto,
            tarifPersen: l.tarifTerPersen,
            pph: l.pph21,
            sumberType: 'PAYROLL_LINE',
            sumberId: l.id,
            createdById: userId,
          },
        });
      }

      return tx.payrollRun.update({
        where: { id },
        data: {
          status: InvoiceStatus.POSTED,
          nomor,
          journalId: journal.id,
          postedAt: new Date(),
          postedById: userId,
        },
      });
    });
  }

  async cancel(id: string, alasan: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id } });
      if (!run) throw new NotFoundException();
      if (run.status !== InvoiceStatus.POSTED) {
        throw new BadRequestException('Hanya POSTED yang bisa di-cancel');
      }
      if (run.journalId) {
        await this.journals.reverseInTx(tx, run.journalId, {
          alasan: `Pembatalan payroll ${run.nomor}: ${alasan}`,
        });
      }
      // Batalkan bukti potong PPh 21 terkait.
      await tx.buktiPotong.updateMany({
        where: { sumberType: 'PAYROLL_LINE', sumberId: { in: (await tx.payrollLine.findMany({
          where: { runId: id }, select: { id: true },
        })).map((l) => l.id) } },
        data: { status: 'DIBATALKAN' },
      });

      return tx.payrollRun.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
        },
      });
    });
  }

  async deleteDraft(id: string) {
    return this.tenancy.run(async (tx) => {
      const r = await tx.payrollRun.findUnique({ where: { id } });
      if (!r) throw new NotFoundException();
      if (r.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Hanya DRAFT yang bisa dihapus');
      }
      await tx.payrollLine.deleteMany({ where: { runId: id } });
      await tx.payrollRun.delete({ where: { id } });
    });
  }
}
