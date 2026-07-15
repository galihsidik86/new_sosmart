import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  CashBankType,
  InvoiceStatus,
  JournalSource,
  PeriodStatus,
  Prisma,
} from '@lentera/db';
import type { CreateCashBankInput } from '@lentera/shared/schemas';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { validateRequestedBy } from '../../common/tenancy/step-up.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import { ApprovalService } from '../approval/approval.service.js';
import { GlConfigKey } from '@lentera/shared/enums';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

/**
 * Prefix nomor per tipe:
 *   RECEIPT  → BKM (Bukti Kas Masuk) atau BBM (Bank Masuk)
 *   PAYMENT  → BKK / BBK
 *   TRANSFER → BMT (Bukti Mutasi Antar Akun)
 * Untuk Phase 4 disederhanakan: BKM/BKK/BMT (tidak dibedakan kas vs bank).
 */
function prefixFor(tipe: CashBankType): string {
  if (tipe === CashBankType.RECEIPT) return 'BKM';
  if (tipe === CashBankType.PAYMENT) return 'BKK';
  return 'BMT';
}

@Injectable()
export class CashBankService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly seq: SequenceService,
    private readonly journals: JournalsService,
    private readonly excel: ExcelService,
    private readonly cabangScope: CabangScopeService,
    private readonly glConfig: GlConfigService,
    private readonly approval: ApprovalService,
  ) {}

  async exportXlsx(filter: {
    status?: InvoiceStatus;
    tipe?: CashBankType;
    periodId?: string;
    cabangId?: string;
    projectId?: string;
    industriId?: string;
    search?: string;
  }): Promise<Buffer> {
    const rows = await this.list(filter);
    return this.excel.buildBuffer(
      'Kas-Bank',
      [
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor ?? '— DRAFT —' },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Tipe', key: 'tipe', width: 10, value: (r) => r.tipe },
        { header: 'Akun Kas/Bank', key: 'akun', width: 28,
          value: (r) => `${r.akunKasBank.kode} ${r.akunKasBank.nama}` },
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang.kode },
        { header: 'Periode', key: 'periode', width: 14, value: (r) => r.fiscalPeriod.label },
        { header: 'Kontak', key: 'kontak', width: 22, value: (r) => r.kontak ?? '' },
        { header: 'Deskripsi', key: 'deskripsi', width: 40, value: (r) => r.deskripsi ?? '' },
        { header: 'Status', key: 'status', width: 12, value: (r) => r.status },
        { header: 'Total', key: 'total', width: 16, format: 'currency', value: (r) => r.total },
      ],
      rows,
    );
  }

  list(filter: {
    status?: InvoiceStatus;
    tipe?: CashBankType;
    periodId?: string;
    cabangId?: string;
    projectId?: string;
    industriId?: string;
    search?: string;
  }) {
    const where: Prisma.CashBankEntryWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.tipe) where.tipe = filter.tipe;
    if (filter.periodId) where.fiscalPeriodId = filter.periodId;
    if (filter.cabangId) {
      this.cabangScope.assertAccess(filter.cabangId);
      where.cabangId = filter.cabangId;
    } else {
      const scope = this.cabangScope.cabangIdsForWhere();
      if (scope) where.cabangId = { in: scope };
    }
    if (filter.projectId || filter.industriId) {
      where.lines = {
        some: {
          ...(filter.projectId ? { projectId: filter.projectId } : {}),
          ...(filter.industriId ? { project: { industriId: filter.industriId } } : {}),
        },
      };
    }
    if (filter.search) {
      const q = filter.search;
      where.OR = [
        { nomor: { contains: q, mode: 'insensitive' } },
        { deskripsi: { contains: q, mode: 'insensitive' } },
        { kontak: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.tenancy.run((tx) =>
      tx.cashBankEntry.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        take: 200,
        include: {
          akunKasBank: { select: { kode: true, nama: true } },
          cabang: { select: { kode: true } },
          fiscalPeriod: { select: { label: true } },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const e = await tx.cashBankEntry.findUnique({
        where: { id },
        include: {
          akunKasBank: true,
          cabang: true,
          lines: {
            orderBy: { no: 'asc' },
            include: {
              account: { select: { kode: true, nama: true } },
              project: { select: { id: true, kode: true, nama: true } },
            },
          },
        },
      });
      if (!e) throw new NotFoundException('Bukti kas/bank tidak ditemukan');
      this.cabangScope.assertAccess(e.cabangId);
      return e;
    });
  }

  async createDraft(input: CreateCashBankInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');

    return this.tenancy.run(async (tx) => {
      await this.cabangScope.assertOwnedByTenant(tx, input.cabangId);
      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');
      if (period.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException(`Periode ${period.label} sudah ditutup`);
      }

      const total = new Decimal(input.total);

      // Untuk RECEIPT/PAYMENT: SUM(lines) harus = total
      if (input.tipe !== CashBankType.TRANSFER) {
        const sumLines = input.lines.reduce(
          (a, l) => a.plus(new Decimal(l.nilai)),
          new Decimal(0),
        );
        if (!sumLines.eq(total)) {
          throw new BadRequestException(
            `Total baris (${sumLines}) tidak sama dengan total header (${total})`,
          );
        }
      }

      return tx.cashBankEntry.create({
        data: {
          tenantId,
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          tanggal,
          tipe: input.tipe,
          akunKasBankId: input.akunKasBankId,
          akunKasBankLawanId:
            input.tipe === CashBankType.TRANSFER ? input.akunKasBankLawanId : null,
          total: total.toFixed(2),
          kontak: input.kontak,
          deskripsi: input.deskripsi,
          linkBukti: input.linkBukti ?? null,
          salesInvoiceId: input.salesInvoiceId,
          purchaseInvoiceId: input.purchaseInvoiceId,
          pph23Dipotong: new Decimal(input.pph23Dipotong ?? '0').toFixed(2),
          noBuktiPotong: input.noBuktiPotong ?? null,
          status: InvoiceStatus.DRAFT,
          createdById: userId,
          lines: {
            create: input.lines.map((l, i) => ({
              tenantId,
              no: i + 1,
              accountId: l.accountId,
              projectId: l.projectId ?? null,
              nilai: l.nilai,
              deskripsi: l.deskripsi,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  async updateDraft(id: string, input: CreateCashBankInput) {
    const tenantId = this.ctx.require().tenantId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');
    return this.tenancy.run(async (tx) => {
      const existing = await tx.cashBankEntry.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Bukti tidak ditemukan');
      // Lihat catatan di SalesService.updateDraft — RLS cuma isolasi tenant,
      // cabang belum dicek di jalur mutasi ini.
      this.cabangScope.assertAccess(existing.cabangId);
      // existing.cabangId aman (RLS-scoped). Target input.cabangId (baru)
      // butuh verifikasi tambahan — lihat CabangScopeService.assertOwnedByTenant.
      await this.cabangScope.assertOwnedByTenant(tx, input.cabangId);
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
      const total = new Decimal(input.total);
      if (input.tipe !== CashBankType.TRANSFER) {
        const sumLines = input.lines.reduce(
          (a, l) => a.plus(new Decimal(l.nilai)), new Decimal(0));
        if (!sumLines.eq(total)) {
          throw new BadRequestException(
            `Total baris (${sumLines}) tidak sama dengan total header (${total})`);
        }
      }
      await tx.cashBankEntryLine.deleteMany({ where: { entryId: id } });
      return tx.cashBankEntry.update({
        where: { id },
        data: {
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          tanggal,
          tipe: input.tipe,
          akunKasBankId: input.akunKasBankId,
          akunKasBankLawanId:
            input.tipe === CashBankType.TRANSFER ? input.akunKasBankLawanId : null,
          total: total.toFixed(2),
          kontak: input.kontak,
          deskripsi: input.deskripsi,
          linkBukti: input.linkBukti ?? null,
          salesInvoiceId: input.salesInvoiceId,
          purchaseInvoiceId: input.purchaseInvoiceId,
          pph23Dipotong: new Decimal(input.pph23Dipotong ?? '0').toFixed(2),
          noBuktiPotong: input.noBuktiPotong ?? null,
          lines: {
            create: input.lines.map((l, i) => ({
              tenantId,
              no: i + 1,
              accountId: l.accountId,
              projectId: l.projectId ?? null,
              nilai: l.nilai,
              deskripsi: l.deskripsi,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  async post(
    id: string,
    opts?: { overrideBudget?: boolean; alasan?: string },
  ) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const e = await tx.cashBankEntry.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!e) throw new NotFoundException();
      this.cabangScope.assertAccess(e.cabangId);
      if (e.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(`Status ${e.status}`);
      }
      // Approval hanya untuk uang KELUAR (PAYMENT).
      if (e.tipe === 'PAYMENT') {
        await this.approval.assertApprovedForPost(tx, 'KAS_BANK', id, new Decimal(e.total));
      }
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: e.fiscalPeriodId },
      });
      if (!period || period.status === PeriodStatus.CLOSED) {
        throw new ForbiddenException('Periode sudah ditutup');
      }

      const prefix = prefixFor(e.tipe);
      const nomor = e.nomor ?? (await this.seq.next(tx, prefix, e.tanggal));
      const total = new Decimal(e.total);

      const lines: Array<{
        accountId: string;
        projectId?: string | null;
        debit: string;
        kredit: string;
        deskripsi?: string;
      }> = [];

      if (e.tipe === CashBankType.RECEIPT) {
        // Debit kas/bank (= total − PPh 23 dipotong pelanggan), kredit per akun lawan.
        const pph23 = new Decimal(e.pph23Dipotong);
        lines.push({
          accountId: e.akunKasBankId,
          debit: total.minus(pph23).toFixed(2),
          kredit: '0',
          deskripsi: e.kontak ?? 'Penerimaan kas/bank',
        });
        // PPh 23 dipotong pelanggan pada pelunasan piutang JKP → dibukukan
        // sebagai kredit pajak (aset "PPh 23 Dibayar Dimuka"), bukan mengurangi
        // pelunasan piutang. Piutang tetap lunas penuh (Cr sebesar total).
        if (pph23.gt(0)) {
          const akunPph23Id = await this.glConfig.getAccountIdInTx(
            tx,
            GlConfigKey.PPH23_DIBAYAR_DIMUKA,
          );
          lines.push({
            accountId: akunPph23Id,
            debit: pph23.toFixed(2),
            kredit: '0',
            deskripsi: `PPh 23 dipotong pelanggan${e.noBuktiPotong ? ` — ${e.noBuktiPotong}` : ''}`,
          });
        }
        for (const l of e.lines) {
          lines.push({
            accountId: l.accountId,
            projectId: l.projectId,
            debit: '0',
            kredit: new Decimal(l.nilai).toFixed(2),
            deskripsi: l.deskripsi ?? undefined,
          });
        }
      } else if (e.tipe === CashBankType.PAYMENT) {
        // Debit per akun lawan, kredit kas/bank
        for (const l of e.lines) {
          lines.push({
            accountId: l.accountId,
            projectId: l.projectId,
            debit: new Decimal(l.nilai).toFixed(2),
            kredit: '0',
            deskripsi: l.deskripsi ?? undefined,
          });
        }
        lines.push({
          accountId: e.akunKasBankId,
          debit: '0',
          kredit: total.toFixed(2),
          deskripsi: e.kontak ?? 'Pengeluaran kas/bank',
        });
      } else {
        // TRANSFER antar akun
        if (!e.akunKasBankLawanId) {
          throw new BadRequestException('TRANSFER butuh akun lawan');
        }
        lines.push({
          accountId: e.akunKasBankLawanId,
          debit: total.toFixed(2),
          kredit: '0',
          deskripsi: 'Mutasi masuk',
        });
        lines.push({
          accountId: e.akunKasBankId,
          debit: '0',
          kredit: total.toFixed(2),
          deskripsi: 'Mutasi keluar',
        });
      }

      const journal = await this.journals.createDraftInTx(tx, {
        cabangId: e.cabangId,
        tanggal: e.tanggal.toISOString().slice(0, 10),
        deskripsi: `${e.tipe} ${nomor}` + (e.kontak ? ` — ${e.kontak}` : ''),
        linkBukti: e.linkBukti ?? null,
        sumber: JournalSource.KAS_BANK,
        sumberRef: e.id,
        lines,
      });
      await this.journals.postInTx(tx, journal.id, null, opts);

      // Update invoice status kalau ini pelunasan
      if (e.salesInvoiceId) {
        await this.applySalesPayment(tx, e.salesInvoiceId, total);
      }
      if (e.purchaseInvoiceId) {
        await this.applyPurchasePayment(tx, e.purchaseInvoiceId, total);
      }

      return tx.cashBankEntry.update({
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

  async cancel(id: string, alasan: string, requestedById?: string | null) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const validRequester = await validateRequestedBy(
        tx, userId, tenantId, requestedById ?? null,
      );
      const e = await tx.cashBankEntry.findUnique({ where: { id } });
      if (!e) throw new NotFoundException();
      this.cabangScope.assertAccess(e.cabangId);
      if (e.status !== InvoiceStatus.POSTED) {
        throw new BadRequestException('Hanya POSTED yang bisa dibatalkan');
      }
      if (e.journalId) {
        await this.journals.reverseInTx(tx, e.journalId, {
          alasan: `Pembatalan ${e.nomor}: ${alasan}`,
        });
      }
      // Revert pelunasan
      const total = new Decimal(e.total).negated();
      if (e.salesInvoiceId) await this.applySalesPayment(tx, e.salesInvoiceId, total);
      if (e.purchaseInvoiceId) await this.applyPurchasePayment(tx, e.purchaseInvoiceId, total);

      return tx.cashBankEntry.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelledRequestedById: validRequester,
        },
      });
    });
  }

  // Update invoice.totalDibayar dan status PAID/PARTIAL.
  private async applySalesPayment(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    delta: Decimal,
  ) {
    // SELECT ... FOR UPDATE: dua BKM untuk faktur yang sama yang diproses
    // bersamaan (read-then-write tanpa lock) bisa saling timpa totalDibayar
    // (lost update) — salah satu pembayaran "hilang" dari akumulasi walau
    // jurnal GL keduanya tetap ter-posting. Lock baris ini dulu sebelum baca.
    const rows = await tx.$queryRaw<
      Array<{ total_netto: string; total_dibayar: string; status: InvoiceStatus }>
    >`SELECT total_netto, total_dibayar, status FROM sales_invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    const inv = rows[0];
    if (!inv) return;
    const dibayar = new Decimal(inv.total_dibayar).plus(delta).toDecimalPlaces(2);
    const netto = new Decimal(inv.total_netto);
    // Tanpa cap ini, kasir bisa input BKM lebih besar dari sisa piutang —
    // sistem diam-diam menandai PAID walau lebih bayar, tanpa jejak akun
    // kelebihan bayar/uang muka mana pun (uang itu "hilang" dari laporan).
    if (dibayar.gt(netto)) {
      throw new BadRequestException(
        `Pembayaran melebihi sisa piutang (sisa ${netto.minus(inv.total_dibayar).toFixed(2)})`,
      );
    }
    let status = inv.status;
    if (dibayar.lte(0)) status = InvoiceStatus.POSTED;
    else if (dibayar.gte(netto)) status = InvoiceStatus.PAID;
    else status = InvoiceStatus.PARTIAL;
    await tx.salesInvoice.update({
      where: { id: invoiceId },
      data: { totalDibayar: dibayar.toFixed(2), status },
    });
  }

  private async applyPurchasePayment(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    delta: Decimal,
  ) {
    // Lihat catatan lock di applySalesPayment.
    const rows = await tx.$queryRaw<
      Array<{ total_netto: string; total_dibayar: string; status: InvoiceStatus }>
    >`SELECT total_netto, total_dibayar, status FROM purchase_invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    const inv = rows[0];
    if (!inv) return;
    const dibayar = new Decimal(inv.total_dibayar).plus(delta).toDecimalPlaces(2);
    const netto = new Decimal(inv.total_netto);
    if (dibayar.gt(netto)) {
      throw new BadRequestException(
        `Pembayaran melebihi sisa utang (sisa ${netto.minus(inv.total_dibayar).toFixed(2)})`,
      );
    }
    let status = inv.status;
    if (dibayar.lte(0)) status = InvoiceStatus.POSTED;
    else if (dibayar.gte(netto)) status = InvoiceStatus.PAID;
    else status = InvoiceStatus.PARTIAL;
    await tx.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { totalDibayar: dibayar.toFixed(2), status },
    });
  }
}
