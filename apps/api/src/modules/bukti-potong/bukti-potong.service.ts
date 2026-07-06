import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BuktiPotongStatus, JenisPph, Prisma } from '@lentera/db';
import type { CreateBuktiPotongManualInput } from '@lentera/shared/schemas';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

@Injectable()
export class BuktiPotongService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly seq: SequenceService,
    private readonly excel: ExcelService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async exportXlsx(opts: { jenisPph?: JenisPph; status?: BuktiPotongStatus; periodId?: string }): Promise<Buffer> {
    const rows = await this.list(opts);
    return this.excel.buildBuffer(
      'Bukti Potong',
      [
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Jenis PPh', key: 'jenis', width: 12, value: (r) => r.jenisPph },
        { header: 'Penerima', key: 'penerima', width: 28, value: (r) => r.pihakNama },
        { header: 'NPWP/NIK', key: 'npwp', width: 20, value: (r) => r.pihakNpwp ?? r.pihakNik ?? '' },
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang.kode },
        { header: 'Periode', key: 'periode', width: 14, value: (r) => r.fiscalPeriod.label },
        { header: 'DPP', key: 'dpp', width: 16, format: 'currency', value: (r) => r.dpp },
        { header: 'Tarif %', key: 'tarif', width: 8, value: (r) => r.tarifPersen },
        { header: 'PPh Dipotong', key: 'pph', width: 16, format: 'currency', value: (r) => r.pph },
        { header: 'Status', key: 'status', width: 14, value: (r) => r.status },
      ],
      rows,
    );
  }

  list(opts: {
    jenisPph?: JenisPph;
    status?: BuktiPotongStatus;
    periodId?: string;
  }) {
    const where: Prisma.BuktiPotongWhereInput = {};
    if (opts.jenisPph) where.jenisPph = opts.jenisPph;
    if (opts.status) where.status = opts.status;
    if (opts.periodId) where.fiscalPeriodId = opts.periodId;
    // Sebelumnya modul ini tidak pernah dicek cabang sama sekali (tidak
    // seperti sales/purchases/dll) — user restricted ke 1 cabang bisa lihat
    // & batalkan bukti potong cabang lain dalam tenant yang sama.
    const scope = this.cabangScope.cabangIdsForWhere();
    if (scope) where.cabangId = { in: scope };
    return this.tenancy.run((tx) =>
      tx.buktiPotong.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { nomor: 'desc' }],
        include: {
          cabang: { select: { kode: true } },
          fiscalPeriod: { select: { label: true } },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const bp = await tx.buktiPotong.findUnique({
        where: { id },
        include: { cabang: true, fiscalPeriod: true },
      });
      if (!bp) throw new NotFoundException('Bukti Potong tidak ditemukan');
      this.cabangScope.assertAccess(bp.cabangId);
      return bp;
    });
  }

  /**
   * Auto-generate dari posted Purchase Invoice yang ada PPh 23.
   * Dipanggil dari PurchasesService.post() setelah journal posted.
   * Idempotent: cek dulu apakah sudah ada bupot untuk line tsb.
   */
  async generateFromPurchaseInvoice(
    tx: Prisma.TransactionClient,
    invoiceId: string,
  ): Promise<number> {
    const inv = await tx.purchaseInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: { select: { nama: true, npwp: true, alamat: true } },
        lines: { where: { pph23: { gt: 0 } } },
      },
    });
    if (!inv || inv.lines.length === 0) return 0;

    let created = 0;
    for (const l of inv.lines) {
      const exist = await tx.buktiPotong.findFirst({
        where: { sumberType: 'PURCHASE_INVOICE_LINE', sumberId: l.id },
      });
      if (exist) continue;

      const nomor = await this.seq.next(tx, 'BP23', inv.tanggal);
      // Hitung tarif efektif dari pph/dpp.
      const dpp = Number(l.dpp);
      const pph = Number(l.pph23);
      const tarif = dpp > 0 ? (pph / dpp) * 100 : 0;

      await tx.buktiPotong.create({
        data: {
          tenantId: inv.tenantId,
          cabangId: inv.cabangId,
          fiscalPeriodId: inv.fiscalPeriodId,
          jenisPph: JenisPph.PPH_23,
          nomor,
          tanggal: inv.tanggal,
          status: BuktiPotongStatus.TERBIT,
          pihakNama: inv.vendor.nama,
          pihakNpwp: inv.vendor.npwp,
          pihakAlamat: inv.vendor.alamat,
          dpp: l.dpp,
          tarifPersen: tarif.toFixed(4),
          pph: l.pph23,
          sumberType: 'PURCHASE_INVOICE_LINE',
          sumberId: l.id,
        },
      });
      created++;
    }
    return created;
  }

  /** Manual create — utk PPh 4(2) sewa, PPh 23 di luar pembelian, dll. */
  async createManual(input: CreateBuktiPotongManualInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');
    this.cabangScope.assertAccess(input.cabangId);

    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');

      // Prefix nomor sesuai jenis PPh.
      const prefix = input.jenisPph === 'PPH_21' ? 'BP21'
        : input.jenisPph === 'PPH_23' ? 'BP23'
        : input.jenisPph === 'PPH_4_AYAT_2' ? 'BP42'
        : 'BP-UNI';
      const nomor = await this.seq.next(tx, prefix, tanggal);

      return tx.buktiPotong.create({
        data: {
          tenantId,
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          jenisPph: input.jenisPph as JenisPph,
          nomor,
          tanggal,
          status: BuktiPotongStatus.TERBIT,
          pihakNama: input.pihakNama,
          pihakNpwp: input.pihakNpwp,
          pihakNik: input.pihakNik,
          pihakAlamat: input.pihakAlamat,
          dpp: input.dpp,
          tarifPersen: String(input.tarifPersen),
          pph: input.pph,
          sumberType: 'MANUAL',
          catatan: input.catatan,
          createdById: userId,
        },
      });
    });
  }

  async cancel(id: string, alasan: string) {
    return this.tenancy.run(async (tx) => {
      const bp = await tx.buktiPotong.findUnique({ where: { id } });
      if (!bp) throw new NotFoundException('Bukti Potong tidak ditemukan');
      this.cabangScope.assertAccess(bp.cabangId);
      return tx.buktiPotong.update({
        where: { id },
        data: {
          status: BuktiPotongStatus.DIBATALKAN,
          catatan: alasan,
        },
      });
    });
  }
}
