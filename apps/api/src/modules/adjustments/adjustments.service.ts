import {
  BadRequestException,
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
  StokMovementType,
} from '@lentera/db';
import type { CreateStokAdjustmentInput } from '@lentera/shared/schemas';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

/**
 * Opname / penyesuaian stok.
 *   createDraft: snapshot qtySaatIni dari saldo aktif tiap item.
 *   post: alokasi nomor ADJ-YYYY-MM-NNNN, record movement OPNAME_PLUS/MINUS,
 *         terbitkan jurnal:
 *           delta+: D Persediaan, K Pendapatan Penyesuaian Persediaan (7-103)
 *           delta-: D Beban Penyesuaian Persediaan (6-109), K Persediaan
 */
@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly seq: SequenceService,
    private readonly journals: JournalsService,
    private readonly inventory: InventoryService,
    private readonly glConfig: GlConfigService,
    private readonly excel: ExcelService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async exportXlsx(filter: { status?: InvoiceStatus; cabangId?: string }): Promise<Buffer> {
    const rows = await this.list(filter);
    return this.excel.buildBuffer(
      'Penyesuaian Stok',
      [
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor ?? '— DRAFT —' },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang.kode },
        { header: 'Periode', key: 'periode', width: 14, value: (r) => r.fiscalPeriod.label },
        { header: 'Alasan', key: 'alasan', width: 40, value: (r) => r.alasan },
        { header: 'Status', key: 'status', width: 12, value: (r) => r.status },
        { header: 'Total Delta Nilai', key: 'total', width: 18, format: 'currency', value: (r) => r.totalDeltaNilai },
        { header: 'Baris', key: 'lines', width: 8, format: 'number', value: (r) => r._count.lines },
      ],
      rows,
    );
  }

  list(filter: { status?: InvoiceStatus; cabangId?: string }) {
    const where: Prisma.StokAdjustmentWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.cabangId) {
      this.cabangScope.assertAccess(filter.cabangId);
      where.cabangId = filter.cabangId;
    } else {
      const scope = this.cabangScope.cabangIdsForWhere();
      if (scope) where.cabangId = { in: scope };
    }
    return this.tenancy.run((tx) =>
      tx.stokAdjustment.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        take: 200,
        include: {
          cabang: { select: { kode: true, nama: true } },
          fiscalPeriod: { select: { label: true } },
          _count: { select: { lines: true } },
        },
      }),
    );
  }

  async byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const a = await tx.stokAdjustment.findUnique({
        where: { id },
        include: {
          cabang: true,
          fiscalPeriod: true,
          lines: {
            orderBy: { no: 'asc' },
            include: { item: { select: { kode: true, nama: true, satuan: true } } },
          },
        },
      });
      if (!a) throw new NotFoundException('Penyesuaian tidak ditemukan');
      this.cabangScope.assertAccess(a.cabangId);
      const uids = [a.postedById, a.postedRequestedById].filter((u): u is string => !!u);
      const users = uids.length
        ? await this.prisma.user.findMany({
            where: { id: { in: uids } },
            select: { id: true, email: true, nama: true },
          })
        : [];
      const lookup = (uid: string | null) => users.find((u) => u.id === uid) ?? null;
      return {
        ...a,
        postedBy: lookup(a.postedById),
        postedRequestedBy: lookup(a.postedRequestedById),
      };
    });
  }

  async createDraft(input: CreateStokAdjustmentInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    this.cabangScope.assertAccess(input.cabangId);
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');

    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');
      if (period.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException(`Periode ${period.label} sudah ditutup`);
      }

      const linesData: Array<{
        no: number; itemId: string; qtySaatIni: string;
        qtyFisik: string; delta: string;
        hargaPokok: string; nilaiDelta: string;
        keterangan: string | null;
      }> = [];
      let totalDeltaNilai = new Decimal(0);

      for (let i = 0; i < input.lines.length; i++) {
        const l = input.lines[i]!;
        const item = await tx.item.findUnique({ where: { id: l.itemId } });
        if (!item) throw new BadRequestException(`Item ${l.itemId} tidak ditemukan`);

        const saldo = await this.inventory.getSaldo(tx, l.itemId, input.cabangId);
        const qtyFisik = new Decimal(l.qtyFisik);
        const delta = qtyFisik.minus(saldo.qty);
        // Harga pokok untuk valuasi: rata-rata saldo (kalau ada) atau 0.
        const hargaPokok = saldo.qty.gt(0)
          ? saldo.nilai.div(saldo.qty)
          : new Decimal(0);
        const nilaiDelta = delta.mul(hargaPokok).toDecimalPlaces(2);
        totalDeltaNilai = totalDeltaNilai.plus(nilaiDelta);

        linesData.push({
          no: i + 1,
          itemId: l.itemId,
          qtySaatIni: saldo.qty.toFixed(4),
          qtyFisik: qtyFisik.toFixed(4),
          delta: delta.toFixed(4),
          hargaPokok: hargaPokok.toFixed(4),
          nilaiDelta: nilaiDelta.toFixed(2),
          keterangan: l.keterangan ?? null,
        });
      }

      return tx.stokAdjustment.create({
        data: {
          tenantId,
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          tanggal,
          alasan: input.alasan,
          status: InvoiceStatus.DRAFT,
          totalDeltaNilai: totalDeltaNilai.toFixed(2),
          createdById: userId,
          lines: {
            create: linesData.map((l) => ({
              tenantId,
              no: l.no,
              itemId: l.itemId,
              qtySaatIni: l.qtySaatIni,
              qtyFisik: l.qtyFisik,
              delta: l.delta,
              hargaPokok: l.hargaPokok,
              nilaiDelta: l.nilaiDelta,
              keterangan: l.keterangan,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  async updateDraft(id: string, input: CreateStokAdjustmentInput) {
    const tenantId = this.ctx.require().tenantId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');
    return this.tenancy.run(async (tx) => {
      const existing = await tx.stokAdjustment.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Penyesuaian tidak ditemukan');
      if (existing.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Hanya draft yang bisa diedit');
      }
      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');
      if (period.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException(`Periode ${period.label} sudah ditutup`);
      }
      const linesData: Array<{
        no: number; itemId: string; qtySaatIni: string;
        qtyFisik: string; delta: string;
        hargaPokok: string; nilaiDelta: string;
        keterangan: string | null;
      }> = [];
      let totalDeltaNilai = new Decimal(0);
      for (let i = 0; i < input.lines.length; i++) {
        const l = input.lines[i]!;
        const item = await tx.item.findUnique({ where: { id: l.itemId } });
        if (!item) throw new BadRequestException(`Item ${l.itemId} tidak ditemukan`);
        const saldo = await this.inventory.getSaldo(tx, l.itemId, input.cabangId);
        const qtyFisik = new Decimal(l.qtyFisik);
        const delta = qtyFisik.minus(saldo.qty);
        const hargaPokok = saldo.qty.gt(0)
          ? saldo.nilai.div(saldo.qty) : new Decimal(0);
        const nilaiDelta = delta.mul(hargaPokok).toDecimalPlaces(2);
        totalDeltaNilai = totalDeltaNilai.plus(nilaiDelta);
        linesData.push({
          no: i + 1, itemId: l.itemId,
          qtySaatIni: saldo.qty.toFixed(4), qtyFisik: qtyFisik.toFixed(4),
          delta: delta.toFixed(4), hargaPokok: hargaPokok.toFixed(4),
          nilaiDelta: nilaiDelta.toFixed(2), keterangan: l.keterangan ?? null,
        });
      }
      await tx.stokAdjustmentLine.deleteMany({ where: { adjustmentId: id } });
      return tx.stokAdjustment.update({
        where: { id },
        data: {
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          tanggal,
          alasan: input.alasan,
          totalDeltaNilai: totalDeltaNilai.toFixed(2),
          lines: {
            create: linesData.map((l) => ({
              tenantId,
              no: l.no, itemId: l.itemId,
              qtySaatIni: l.qtySaatIni, qtyFisik: l.qtyFisik,
              delta: l.delta, hargaPokok: l.hargaPokok,
              nilaiDelta: l.nilaiDelta, keterangan: l.keterangan,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  async post(id: string, requestedById?: string | null) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      if (requestedById && requestedById !== userId) {
        const m = await tx.membership.findUnique({
          where: { userId_tenantId: { userId: requestedById, tenantId } },
          select: { userId: true },
        });
        if (!m) throw new BadRequestException('Requester (X-Requested-By) bukan anggota tenant');
      }
      const adj = await tx.stokAdjustment.findUnique({
        where: { id },
        include: {
          lines: { include: { item: { select: { kode: true, akunPersediaanId: true } } } },
        },
      });
      if (!adj) throw new NotFoundException();
      if (adj.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(`Status ${adj.status}, tidak bisa di-post`);
      }
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: adj.fiscalPeriodId },
      });
      if (period?.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException('Periode sudah ditutup');
      }

      const nomor = adj.nomor ?? (await this.seq.next(tx, 'ADJ', adj.tanggal));

      // Akun untuk jurnal (resolve via GlConfig dgn fallback ke kode default).
      const akunBebanId = await this.glConfig.getAccountIdInTx(tx, 'OPNAME_MINUS');
      const akunPendapatanId = await this.glConfig.getAccountIdInTx(tx, 'OPNAME_PLUS');

      let totalPlus = new Decimal(0);    // jumlah nilai delta positif (D persediaan, K pendapatan)
      let totalMinus = new Decimal(0);   // jumlah nilai delta negatif (D beban, K persediaan)
      const persediaanDebit = new Map<string, Decimal>();    // delta+ → tambah persediaan
      const persediaanKredit = new Map<string, Decimal>();   // delta- → kurangi persediaan

      for (const l of adj.lines) {
        const delta = new Decimal(l.delta);
        const nilai = new Decimal(l.nilaiDelta);
        if (delta.eq(0)) continue;
        if (!l.item?.akunPersediaanId) {
          throw new BadRequestException(`Item ${l.item?.kode} tidak punya akun persediaan`);
        }

        if (delta.gt(0)) {
          // Stok bertambah (fisik > pencatatan): record OPNAME_PLUS dengan harga pokok terakhir.
          await this.inventory.recordInbound(tx, {
            itemId: l.itemId,
            cabangId: adj.cabangId,
            tanggal: adj.tanggal,
            qty: delta,
            hargaPokok: new Decimal(l.hargaPokok),
            tipe: StokMovementType.OPNAME_PLUS,
            sumberType: 'ADJUSTMENT_LINE',
            sumberId: l.id,
            keterangan: `Opname ${nomor}`,
          });
          totalPlus = totalPlus.plus(nilai);
          persediaanDebit.set(
            l.item.akunPersediaanId,
            (persediaanDebit.get(l.item.akunPersediaanId) ?? new Decimal(0)).plus(nilai),
          );
        } else {
          // Stok berkurang.
          await this.inventory.recordOutbound(tx, {
            itemId: l.itemId,
            cabangId: adj.cabangId,
            tanggal: adj.tanggal,
            qty: delta.abs(),
            tipe: StokMovementType.OPNAME_MINUS,
            sumberType: 'ADJUSTMENT_LINE',
            sumberId: l.id,
            keterangan: `Opname ${nomor}`,
          });
          const absNilai = nilai.abs();
          totalMinus = totalMinus.plus(absNilai);
          persediaanKredit.set(
            l.item.akunPersediaanId,
            (persediaanKredit.get(l.item.akunPersediaanId) ?? new Decimal(0)).plus(absNilai),
          );
        }
      }

      // Bangun jurnal.
      const jLines: Array<{
        accountId: string; debit: string; kredit: string; deskripsi?: string;
      }> = [];
      for (const [aid, n] of persediaanDebit) {
        if (n.gt(0)) jLines.push({ accountId: aid, debit: n.toFixed(2), kredit: '0', deskripsi: 'Tambah stok (opname+)' });
      }
      if (totalPlus.gt(0)) {
        jLines.push({ accountId: akunPendapatanId, debit: '0', kredit: totalPlus.toFixed(2), deskripsi: 'Pendapatan penyesuaian' });
      }
      if (totalMinus.gt(0)) {
        jLines.push({ accountId: akunBebanId, debit: totalMinus.toFixed(2), kredit: '0', deskripsi: 'Beban penyesuaian' });
      }
      for (const [aid, n] of persediaanKredit) {
        if (n.gt(0)) jLines.push({ accountId: aid, debit: '0', kredit: n.toFixed(2), deskripsi: 'Kurangi stok (opname-)' });
      }

      let journalId: string | null = null;
      if (jLines.length >= 2) {
        const journal = await this.journals.createDraftInTx(tx, {
          cabangId: adj.cabangId,
          tanggal: adj.tanggal.toISOString().slice(0, 10),
          deskripsi: `Opname stok ${nomor} — ${adj.alasan}`,
          sumber: JournalSource.PENYESUAIAN,
          sumberRef: adj.id,
          lines: jLines,
        });
        await this.journals.postInTx(tx, journal.id);
        journalId = journal.id;
      }

      return tx.stokAdjustment.update({
        where: { id },
        data: {
          status: InvoiceStatus.POSTED,
          nomor,
          journalId,
          postedAt: new Date(),
          postedById: userId,
          postedRequestedById: requestedById && requestedById !== userId ? requestedById : null,
        },
      });
    });
  }

  async cancel(id: string, alasan: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const adj = await tx.stokAdjustment.findUnique({ where: { id } });
      if (!adj) throw new NotFoundException();
      if (adj.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('Sudah dibatalkan');
      }
      if (adj.status === InvoiceStatus.POSTED) {
        if (adj.journalId) {
          await this.journals.reverseInTx(tx, adj.journalId, {
            alasan: `Pembatalan opname ${adj.nomor}: ${alasan}`,
          });
        }
        // Reverse stok movements yang sumber ADJUSTMENT_LINE adj.id
        const lines = await tx.stokAdjustmentLine.findMany({ where: { adjustmentId: id } });
        for (const l of lines) {
          await this.inventory.reverseInbound(tx, 'ADJUSTMENT_LINE', l.id, new Date());
        }
      }
      return tx.stokAdjustment.update({
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
      const adj = await tx.stokAdjustment.findUnique({ where: { id } });
      if (!adj) throw new NotFoundException();
      if (adj.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Hanya DRAFT yang bisa dihapus');
      }
      await tx.stokAdjustmentLine.deleteMany({ where: { adjustmentId: id } });
      await tx.stokAdjustment.delete({ where: { id } });
    });
  }
}
