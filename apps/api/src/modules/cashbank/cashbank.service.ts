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
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { JournalsService } from '../journals/journals.service.js';

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
  ) {}

  list(filter: { status?: InvoiceStatus; tipe?: CashBankType; periodId?: string }) {
    const where: Prisma.CashBankEntryWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.tipe) where.tipe = filter.tipe;
    if (filter.periodId) where.fiscalPeriodId = filter.periodId;
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
            include: { account: { select: { kode: true, nama: true } } },
          },
        },
      });
      if (!e) throw new NotFoundException('Bukti kas/bank tidak ditemukan');
      return e;
    });
  }

  async createDraft(input: CreateCashBankInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');

    return this.tenancy.run(async (tx) => {
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
          salesInvoiceId: input.salesInvoiceId,
          purchaseInvoiceId: input.purchaseInvoiceId,
          status: InvoiceStatus.DRAFT,
          createdById: userId,
          lines: {
            create: input.lines.map((l, i) => ({
              tenantId,
              no: i + 1,
              accountId: l.accountId,
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
          salesInvoiceId: input.salesInvoiceId,
          purchaseInvoiceId: input.purchaseInvoiceId,
          lines: {
            create: input.lines.map((l, i) => ({
              tenantId,
              no: i + 1,
              accountId: l.accountId,
              nilai: l.nilai,
              deskripsi: l.deskripsi,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  async post(id: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const e = await tx.cashBankEntry.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!e) throw new NotFoundException();
      if (e.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(`Status ${e.status}`);
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
        accountId: string; debit: string; kredit: string; deskripsi?: string;
      }> = [];

      if (e.tipe === CashBankType.RECEIPT) {
        // Debit kas/bank, kredit per akun lawan
        lines.push({
          accountId: e.akunKasBankId,
          debit: total.toFixed(2),
          kredit: '0',
          deskripsi: e.kontak ?? 'Penerimaan kas/bank',
        });
        for (const l of e.lines) {
          lines.push({
            accountId: l.accountId,
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
        sumber: JournalSource.KAS_BANK,
        sumberRef: e.id,
        lines,
      });
      await this.journals.postInTx(tx, journal.id);

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

  async cancel(id: string, alasan: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const e = await tx.cashBankEntry.findUnique({ where: { id } });
      if (!e) throw new NotFoundException();
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
    const inv = await tx.salesInvoice.findUnique({
      where: { id: invoiceId },
      select: { totalNetto: true, totalDibayar: true, status: true },
    });
    if (!inv) return;
    const dibayar = new Decimal(inv.totalDibayar).plus(delta).toDecimalPlaces(2);
    const netto = new Decimal(inv.totalNetto);
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
    const inv = await tx.purchaseInvoice.findUnique({
      where: { id: invoiceId },
      select: { totalNetto: true, totalDibayar: true, status: true },
    });
    if (!inv) return;
    const dibayar = new Decimal(inv.totalDibayar).plus(delta).toDecimalPlaces(2);
    const netto = new Decimal(inv.totalNetto);
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
