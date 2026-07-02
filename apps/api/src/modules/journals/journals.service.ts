import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  JournalStatus,
  PeriodStatus,
  Prisma,
} from '@lentera/db';
import type {
  CreateJournalInput,
  JournalLineInput,
  JournalSourceInput,
} from '@lentera/shared/schemas';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { PeriodsService } from '../periods/periods.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

interface ListFilter {
  periodId?: string;
  cabangId?: string;
  status?: JournalStatus;
  sumber?: JournalSourceInput;
  search?: string;
}

/**
 * Konvensi:
 *   - Method publik (`createDraft`, `post`, `reverse`, `deleteDraft`) buka
 *     transaksi sendiri lewat `tenancy.run`. Dipakai untuk endpoint langsung.
 *   - Method internal (`createDraftInTx`, `postInTx`, `reverseInTx`,
 *     `deleteDraftInTx`) menerima `tx: Prisma.TransactionClient` dari pemanggil.
 *     Dipakai oleh service lain (sales/purchases/cashbank/adjustments/aset/
 *     payroll/depresiasi) supaya seluruh operasi POST mereka atomic di SATU
 *     transaksi (Prisma TIDAK support nested $transaction).
 */
@Injectable()
export class JournalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly seq: SequenceService,
    private readonly periods: PeriodsService,
    private readonly excel: ExcelService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async exportXlsx(f: ListFilter): Promise<Buffer> {
    const rows = await this.list(f);
    return this.excel.buildBuffer(
      'Jurnal',
      [
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor ?? '— DRAFT —' },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang.kode },
        { header: 'Periode', key: 'periode', width: 14, value: (r) => r.fiscalPeriod.label },
        { header: 'Sumber', key: 'sumber', width: 12, value: (r) => r.sumber },
        { header: 'Status', key: 'status', width: 10, value: (r) => r.status },
        { header: 'Deskripsi', key: 'deskripsi', width: 40, value: (r) => r.deskripsi },
        { header: 'Total Debit', key: 'totalDebit', width: 16, format: 'currency',
          value: (r) => r.totalDebit },
        { header: 'Total Kredit', key: 'totalKredit', width: 16, format: 'currency',
          value: (r) => r.totalKredit },
        { header: 'Baris', key: 'lines', width: 8, format: 'number',
          value: (r) => r._count.lines },
      ],
      rows,
    );
  }

  // -----------------------------------------------------------
  // QUERY
  // -----------------------------------------------------------

  list(f: ListFilter) {
    const where: Prisma.JournalWhereInput = {};
    if (f.periodId) where.fiscalPeriodId = f.periodId;
    if (f.cabangId) {
      this.cabangScope.assertAccess(f.cabangId);
      where.cabangId = f.cabangId;
    } else {
      const scope = this.cabangScope.cabangIdsForWhere();
      if (scope) where.cabangId = { in: scope };
    }
    if (f.status) where.status = f.status;
    if (f.sumber) where.sumber = f.sumber;
    if (f.search) {
      where.OR = [
        { nomor: { contains: f.search, mode: 'insensitive' } },
        { deskripsi: { contains: f.search, mode: 'insensitive' } },
      ];
    }
    return this.tenancy.run((tx) =>
      tx.journal.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        include: {
          cabang: { select: { kode: true, nama: true } },
          fiscalPeriod: { select: { label: true } },
          _count: { select: { lines: true } },
        },
        take: 200,
      }),
    );
  }

  async byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const j = await tx.journal.findUnique({
        where: { id },
        include: {
          cabang: true,
          fiscalPeriod: true,
          lines: {
            orderBy: { no: 'asc' },
            include: {
              account: { select: { kode: true, nama: true, normalBalance: true } },
              project: { select: { id: true, kode: true, nama: true } },
            },
          },
          reversedFrom: { select: { id: true, nomor: true } },
          reversals: { select: { id: true, nomor: true, status: true } },
        },
      });
      if (!j) throw new NotFoundException('Jurnal tidak ditemukan');
      this.cabangScope.assertAccess(j.cabangId);
      const uids = [j.postedById, j.postedRequestedById].filter((u): u is string => !!u);
      const users = uids.length
        ? await this.prisma.user.findMany({
            where: { id: { in: uids } },
            select: { id: true, email: true, nama: true },
          })
        : [];
      const lookup = (uid: string | null) => users.find((u) => u.id === uid) ?? null;
      return {
        ...j,
        postedBy: lookup(j.postedById),
        postedRequestedBy: lookup(j.postedRequestedById),
      };
    });
  }

  // -----------------------------------------------------------
  // CREATE DRAFT (internal + public)
  // -----------------------------------------------------------

  async createDraftInTx(
    tx: Prisma.TransactionClient,
    input: CreateJournalInput,
  ) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    this.cabangScope.assertAccess(input.cabangId);
    const tanggal = new Date(input.tanggal + 'T00:00:00.000Z');

    const period = await tx.fiscalPeriod.findFirst({
      where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
    });
    if (!period) {
      throw new BadRequestException(
        `Tanggal ${input.tanggal} di luar tahun buku — buat periode dulu`,
      );
    }
    if (period.status === PeriodStatus.CLOSED) {
      throw new ForbiddenException(
        `Periode ${period.label} sudah ditutup — tidak bisa buat draft jurnal`,
      );
    }

    await this.assertLinesValid(tx, input.lines);
    const { td, tk } = this.sumLines(input.lines);

    return tx.journal.create({
      data: {
        tenantId,
        cabangId: input.cabangId,
        fiscalPeriodId: period.id,
        tanggal,
        deskripsi: input.deskripsi,
        sumber: input.sumber,
        sumberRef: input.sumberRef ?? null,
        status: JournalStatus.DRAFT,
        totalDebit: td.toFixed(2),
        totalKredit: tk.toFixed(2),
        createdById: userId,
        lines: {
          create: input.lines.map((l, i) => ({
            tenantId,
            accountId: l.accountId,
            projectId: l.projectId ?? null,
            no: i + 1,
            debit: l.debit,
            kredit: l.kredit,
            deskripsi: l.deskripsi ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async createDraft(input: CreateJournalInput) {
    return this.tenancy.run((tx) => this.createDraftInTx(tx, input));
  }

  // -----------------------------------------------------------
  // POST (DRAFT → POSTED)
  // -----------------------------------------------------------

  async postInTx(
    tx: Prisma.TransactionClient,
    journalId: string,
    requestedById?: string | null,
  ) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    if (requestedById && requestedById !== userId) {
      const m = await tx.membership.findUnique({
        where: { userId_tenantId: { userId: requestedById, tenantId } },
        select: { userId: true },
      });
      if (!m) throw new BadRequestException('Requester (X-Requested-By) bukan anggota tenant');
    }
    const j = await tx.journal.findUnique({
      where: { id: journalId },
      include: { lines: true },
    });
    if (!j) throw new NotFoundException('Jurnal tidak ditemukan');
    if (j.status !== JournalStatus.DRAFT) {
      throw new BadRequestException(`Jurnal ${j.nomor ?? j.id} status ${j.status}, tidak bisa di-post`);
    }
    await this.periods.assertOpen(tx, j.tanggal);

    const td = new Decimal(j.totalDebit);
    const tk = new Decimal(j.totalKredit);
    if (!td.eq(tk) || td.lte(0)) {
      throw new BadRequestException('Total debit dan kredit harus seimbang dan > 0');
    }
    if (j.lines.length < 2) {
      throw new BadRequestException('Minimal 2 baris');
    }

    const nomor = j.nomor ?? (await this.seq.next(tx, 'JU', j.tanggal));

    return tx.journal.update({
      where: { id: j.id },
      data: {
        status: JournalStatus.POSTED,
        nomor,
        postedAt: new Date(),
        postedById: userId,
        postedRequestedById: requestedById && requestedById !== userId ? requestedById : null,
      },
    });
  }

  async post(journalId: string, requestedById?: string | null) {
    return this.tenancy.run((tx) => this.postInTx(tx, journalId, requestedById));
  }

  // -----------------------------------------------------------
  // REVERSE (POSTED → REVERSED, terbitkan jurnal kebalikan)
  // -----------------------------------------------------------

  async reverseInTx(
    tx: Prisma.TransactionClient,
    originalId: string,
    opts: { tanggal?: Date; alasan: string },
  ) {
    const userId = this.ctx.require().userId;
    const orig = await tx.journal.findUnique({
      where: { id: originalId },
      include: { lines: { orderBy: { no: 'asc' } } },
    });
    if (!orig) throw new NotFoundException('Jurnal asli tidak ditemukan');
    if (orig.status !== JournalStatus.POSTED) {
      throw new BadRequestException('Hanya jurnal POSTED yang bisa dibalik');
    }
    if (orig.reversedById) {
      throw new BadRequestException('Jurnal sudah dibalik sebelumnya');
    }
    const tanggal = opts.tanggal ?? new Date();
    const period = await tx.fiscalPeriod.findFirst({
      where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
    });
    if (!period) {
      throw new BadRequestException('Tanggal pembalik di luar tahun buku');
    }
    if (period.status === PeriodStatus.CLOSED) {
      throw new ForbiddenException(
        `Periode ${period.label} sudah ditutup — tidak bisa terbitkan pembalik`,
      );
    }

    const td = new Decimal(orig.totalDebit);
    const nomor = await this.seq.next(tx, 'JU', tanggal);

    const pembalik = await tx.journal.create({
      data: {
        tenantId: orig.tenantId,
        cabangId: orig.cabangId,
        fiscalPeriodId: period.id,
        tanggal,
        deskripsi: `Pembalik ${orig.nomor}: ${opts.alasan}`,
        sumber: orig.sumber,
        sumberRef: orig.id,
        status: JournalStatus.POSTED,
        nomor,
        totalDebit: td.toFixed(2),
        totalKredit: td.toFixed(2),
        reversedFromId: orig.id,
        createdById: userId,
        postedAt: new Date(),
        postedById: userId,
        lines: {
          create: orig.lines.map((l, i) => ({
            tenantId: orig.tenantId,
            accountId: l.accountId,
            projectId: l.projectId,
            no: i + 1,
            debit: l.kredit,
            kredit: l.debit,
            deskripsi: `Pembalik: ${l.deskripsi ?? ''}`,
          })),
        },
      },
    });

    await tx.journal.update({
      where: { id: orig.id },
      data: { status: JournalStatus.REVERSED, reversedById: pembalik.id },
    });

    return pembalik;
  }

  async reverse(
    originalId: string,
    opts: { tanggal?: Date; alasan: string },
  ) {
    return this.tenancy.run((tx) => this.reverseInTx(tx, originalId, opts));
  }

  // -----------------------------------------------------------
  // UPDATE DRAFT (hanya status DRAFT)
  // -----------------------------------------------------------

  async updateDraft(id: string, input: CreateJournalInput) {
    return this.tenancy.run(async (tx) => {
      const existing = await tx.journal.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Jurnal tidak ditemukan');
      if (existing.status !== JournalStatus.DRAFT) {
        throw new BadRequestException('Hanya draft yang bisa diedit');
      }

      const tanggal = new Date(input.tanggal + 'T00:00:00.000Z');
      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
      });
      if (!period) {
        throw new BadRequestException(
          `Tanggal ${input.tanggal} di luar tahun buku — buat periode dulu`,
        );
      }
      if (period.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException(
          `Periode ${period.label} sudah ditutup — tidak bisa edit draft`,
        );
      }
      await this.assertLinesValid(tx, input.lines);
      const { td, tk } = this.sumLines(input.lines);

      const tenantId = this.ctx.require().tenantId;
      await tx.journalLine.deleteMany({ where: { journalId: id } });
      return tx.journal.update({
        where: { id },
        data: {
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          tanggal,
          deskripsi: input.deskripsi,
          sumber: input.sumber,
          sumberRef: input.sumberRef ?? null,
          totalDebit: td.toFixed(2),
          totalKredit: tk.toFixed(2),
          lines: {
            create: input.lines.map((l, i) => ({
              tenantId,
              accountId: l.accountId,
              projectId: l.projectId ?? null,
              no: i + 1,
              debit: l.debit,
              kredit: l.kredit,
              deskripsi: l.deskripsi ?? null,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  // -----------------------------------------------------------
  // DELETE DRAFT (hanya status DRAFT)
  // -----------------------------------------------------------

  async deleteDraftInTx(tx: Prisma.TransactionClient, id: string) {
    const j = await tx.journal.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('Jurnal tidak ditemukan');
    if (j.status !== JournalStatus.DRAFT) {
      throw new BadRequestException('Hanya draft yang bisa dihapus');
    }
    await tx.journalLine.deleteMany({ where: { journalId: id } });
    await tx.journal.delete({ where: { id } });
  }

  async deleteDraft(id: string) {
    return this.tenancy.run((tx) => this.deleteDraftInTx(tx, id));
  }

  // -----------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------

  private sumLines(lines: JournalLineInput[]) {
    let td = new Decimal(0);
    let tk = new Decimal(0);
    for (const l of lines) {
      td = td.plus(new Decimal(l.debit));
      tk = tk.plus(new Decimal(l.kredit));
    }
    return { td, tk };
  }

  private async assertLinesValid(
    tx: Prisma.TransactionClient,
    lines: JournalLineInput[],
  ): Promise<void> {
    const ids = Array.from(new Set(lines.map((l) => l.accountId)));
    const accts = await tx.account.findMany({
      where: { id: { in: ids } },
      select: { id: true, isPostable: true, isActive: true, kode: true },
    });
    const byId = new Map(accts.map((a) => [a.id, a]));
    for (const l of lines) {
      const a = byId.get(l.accountId);
      if (!a) {
        throw new BadRequestException(`Akun ${l.accountId} tidak ditemukan`);
      }
      if (!a.isPostable || !a.isActive) {
        throw new BadRequestException(
          `Akun ${a.kode} bukan akun postable yang aktif`,
        );
      }
    }
  }
}
