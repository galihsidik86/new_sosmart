import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { InvoiceStatus, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

/**
 * Aging Piutang (AR) — dihitung on-the-fly dari faktur penjualan POSTED/PARTIAL/PAID
 * yang tanggalnya ≤ asOf, sisa > 0 setelah pelunasan hingga asOf.
 *
 * Pelunasan di-agregasi dari CashBankEntry POSTED dengan salesInvoiceId,
 * bukan dari SalesInvoice.totalDibayar (yang hanya reflect state terkini).
 * Ini penting untuk aging historis: pembayaran setelah asOf tidak boleh
 * mengurangi saldo.
 *
 * Bucket days-overdue (asOf - jatuhTempo):
 *   belumJatuh: < 0 (jatuh tempo di masa depan)
 *   b1_30     : 0..30
 *   b31_60    : 31..60
 *   b61_90    : 61..90
 *   above90   : > 90
 */

export interface ArAgingBuckets {
  belumJatuh: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  above90: string;
}

export interface ArAgingRow {
  customerId: string;
  kode: string;
  nama: string;
  saldo: string;
  buckets: ArAgingBuckets;
  jumlahFaktur: number;
}

export interface ArAgingResponse {
  asOf: string;
  cabangId?: string;
  totalSaldo: string;
  totalBuckets: ArAgingBuckets;
  rows: ArAgingRow[];
}

export interface ArStatementInvoice {
  id: string;
  nomor: string | null;
  tanggal: string;
  jatuhTempo: string;
  totalNetto: string;
  dibayar: string;
  sisa: string;
  daysOverdue: number;
  status: InvoiceStatus;
  bucket: keyof ArAgingBuckets;
  payments: Array<{
    id: string;
    nomor: string | null;
    tanggal: string;
    total: string;
  }>;
}

export interface ArStatementResponse {
  asOf: string;
  customer: { id: string; kode: string; nama: string };
  totalSaldo: string;
  totalBuckets: ArAgingBuckets;
  invoices: ArStatementInvoice[];
}

@Injectable()
export class ArAgingService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async build(opts: { asOf: string; cabangId?: string; jenisPelangganId?: string }): Promise<ArAgingResponse> {
    return this.tenancy.run(async (tx) => {
      if (opts.cabangId) this.cabangScope.assertAccess(opts.cabangId);
      const asOfDate = this.parseDate(opts.asOf);
      const invoices = await this.fetchOpenInvoices(tx, asOfDate, opts.cabangId, undefined, opts.jenisPelangganId);

      const perCustomer = new Map<
        string,
        { customer: { id: string; kode: string; nama: string }; saldo: Decimal; buckets: BucketAcc; count: number }
      >();

      for (const inv of invoices) {
        const bucket = classifyBucket(asOfDate, inv.jatuhTempo);
        const cur = perCustomer.get(inv.customer.id) ?? {
          customer: inv.customer,
          saldo: new Decimal(0),
          buckets: emptyBucketAcc(),
          count: 0,
        };
        cur.saldo = cur.saldo.plus(inv.sisa);
        cur.buckets[bucket] = cur.buckets[bucket].plus(inv.sisa);
        cur.count += 1;
        perCustomer.set(inv.customer.id, cur);
      }

      const rows: ArAgingRow[] = Array.from(perCustomer.values())
        .sort((a, b) => b.saldo.cmp(a.saldo))
        .map((c) => ({
          customerId: c.customer.id,
          kode: c.customer.kode,
          nama: c.customer.nama,
          saldo: c.saldo.toFixed(2),
          buckets: serializeBucketAcc(c.buckets),
          jumlahFaktur: c.count,
        }));

      const totalBuckets = emptyBucketAcc();
      let totalSaldo = new Decimal(0);
      for (const c of perCustomer.values()) {
        totalSaldo = totalSaldo.plus(c.saldo);
        for (const k of BUCKET_KEYS) totalBuckets[k] = totalBuckets[k].plus(c.buckets[k]);
      }

      return {
        asOf: opts.asOf,
        cabangId: opts.cabangId,
        totalSaldo: totalSaldo.toFixed(2),
        totalBuckets: serializeBucketAcc(totalBuckets),
        rows,
      };
    });
  }

  async statement(opts: {
    customerId: string;
    asOf: string;
    cabangId?: string;
  }): Promise<ArStatementResponse> {
    return this.tenancy.run(async (tx) => {
      if (opts.cabangId) this.cabangScope.assertAccess(opts.cabangId);
      const asOfDate = this.parseDate(opts.asOf);

      const customer = await tx.customer.findUnique({
        where: { id: opts.customerId },
        select: { id: true, kode: true, nama: true },
      });
      if (!customer) throw new NotFoundException('Customer tidak ditemukan');

      const invoices = await this.fetchOpenInvoices(tx, asOfDate, opts.cabangId, opts.customerId);

      const invoiceIds = invoices.map((i) => i.id);
      const paymentsByInvoice = await this.fetchPayments(tx, invoiceIds, asOfDate);

      const invRows: ArStatementInvoice[] = invoices
        .sort((a, b) => a.tanggal.getTime() - b.tanggal.getTime())
        .map((inv) => {
          const bucket = classifyBucket(asOfDate, inv.jatuhTempo);
          return {
            id: inv.id,
            nomor: inv.nomor,
            tanggal: inv.tanggal.toISOString().slice(0, 10),
            jatuhTempo: inv.jatuhTempo.toISOString().slice(0, 10),
            totalNetto: inv.totalNetto.toFixed(2),
            dibayar: inv.dibayar.toFixed(2),
            sisa: inv.sisa.toFixed(2),
            daysOverdue: daysBetween(asOfDate, inv.jatuhTempo),
            status: inv.status,
            bucket,
            payments: (paymentsByInvoice.get(inv.id) ?? []).map((p) => ({
              id: p.id,
              nomor: p.nomor,
              tanggal: p.tanggal.toISOString().slice(0, 10),
              total: p.total.toFixed(2),
            })),
          };
        });

      const totalBuckets = emptyBucketAcc();
      let totalSaldo = new Decimal(0);
      for (const inv of invoices) {
        const b = classifyBucket(asOfDate, inv.jatuhTempo);
        totalBuckets[b] = totalBuckets[b].plus(inv.sisa);
        totalSaldo = totalSaldo.plus(inv.sisa);
      }

      return {
        asOf: opts.asOf,
        customer,
        totalSaldo: totalSaldo.toFixed(2),
        totalBuckets: serializeBucketAcc(totalBuckets),
        invoices: invRows,
      };
    });
  }

  // ---------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------

  private parseDate(iso: string): Date {
    // Terima YYYY-MM-DD (tanggal saja). Anggap end-of-day UTC supaya bandingan
    // "invoice.tanggal <= asOf" konsisten.
    const d = new Date(`${iso}T23:59:59.999Z`);
    if (Number.isNaN(d.getTime())) throw new NotFoundException(`asOf invalid: ${iso}`);
    return d;
  }

  private async fetchOpenInvoices(
    tx: Prisma.TransactionClient,
    asOf: Date,
    cabangId?: string,
    customerId?: string,
    jenisPelangganId?: string,
  ): Promise<
    Array<{
      id: string;
      nomor: string | null;
      tanggal: Date;
      jatuhTempo: Date;
      totalNetto: Decimal;
      dibayar: Decimal;
      sisa: Decimal;
      status: InvoiceStatus;
      customer: { id: string; kode: string; nama: string };
    }>
  > {
    const allowed = this.cabangScope.cabangIdsForWhere();
    const cabangFilter =
      cabangId != null
        ? { cabangId }
        : allowed
          ? { cabangId: { in: allowed } }
          : {};

    const invs = await tx.salesInvoice.findMany({
      where: {
        ...cabangFilter,
        ...(customerId ? { customerId } : {}),
        ...(jenisPelangganId ? { customer: { jenisPelangganId } } : {}),
        tanggal: { lte: asOf },
        status: { in: [InvoiceStatus.POSTED, InvoiceStatus.PARTIAL, InvoiceStatus.PAID] },
      },
      select: {
        id: true,
        nomor: true,
        tanggal: true,
        jatuhTempo: true,
        totalNetto: true,
        status: true,
        customer: { select: { id: true, kode: true, nama: true } },
      },
    });
    if (invs.length === 0) return [];

    // Agregasi pembayaran sampai asOf dari CashBankEntry POSTED per faktur.
    const paidAggregates = await tx.cashBankEntry.groupBy({
      by: ['salesInvoiceId'],
      where: {
        salesInvoiceId: { in: invs.map((i) => i.id) },
        status: InvoiceStatus.POSTED,
        tanggal: { lte: asOf },
      },
      _sum: { total: true },
    });
    const paidMap = new Map<string, Decimal>();
    for (const p of paidAggregates) {
      if (p.salesInvoiceId) paidMap.set(p.salesInvoiceId, new Decimal(p._sum.total ?? 0));
    }

    return invs
      .map((i) => {
        const dibayar = paidMap.get(i.id) ?? new Decimal(0);
        const totalNetto = new Decimal(i.totalNetto);
        const sisa = totalNetto.minus(dibayar);
        return {
          id: i.id,
          nomor: i.nomor,
          tanggal: i.tanggal,
          jatuhTempo: i.jatuhTempo,
          totalNetto,
          dibayar,
          sisa,
          status: i.status,
          customer: i.customer,
        };
      })
      .filter((i) => i.sisa.gt(0));
  }

  private async fetchPayments(
    tx: Prisma.TransactionClient,
    invoiceIds: string[],
    asOf: Date,
  ): Promise<Map<string, Array<{ id: string; nomor: string | null; tanggal: Date; total: Decimal }>>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await tx.cashBankEntry.findMany({
      where: {
        salesInvoiceId: { in: invoiceIds },
        status: InvoiceStatus.POSTED,
        tanggal: { lte: asOf },
      },
      select: { id: true, nomor: true, tanggal: true, total: true, salesInvoiceId: true },
      orderBy: { tanggal: 'asc' },
    });
    const map = new Map<string, Array<{ id: string; nomor: string | null; tanggal: Date; total: Decimal }>>();
    for (const r of rows) {
      if (!r.salesInvoiceId) continue;
      const arr = map.get(r.salesInvoiceId) ?? [];
      arr.push({ id: r.id, nomor: r.nomor, tanggal: r.tanggal, total: new Decimal(r.total) });
      map.set(r.salesInvoiceId, arr);
    }
    return map;
  }
}

// -----------------------------------------------------------------
// Bucket helpers (shared with AP aging via same shape)
// -----------------------------------------------------------------

const BUCKET_KEYS = ['belumJatuh', 'b1_30', 'b31_60', 'b61_90', 'above90'] as const;
type BucketKey = (typeof BUCKET_KEYS)[number];
type BucketAcc = Record<BucketKey, Decimal>;

function emptyBucketAcc(): BucketAcc {
  return { belumJatuh: new Decimal(0), b1_30: new Decimal(0), b31_60: new Decimal(0), b61_90: new Decimal(0), above90: new Decimal(0) };
}

function serializeBucketAcc(b: BucketAcc): ArAgingBuckets {
  return {
    belumJatuh: b.belumJatuh.toFixed(2),
    b1_30: b.b1_30.toFixed(2),
    b31_60: b.b31_60.toFixed(2),
    b61_90: b.b61_90.toFixed(2),
    above90: b.above90.toFixed(2),
  };
}

function classifyBucket(asOf: Date, jatuhTempo: Date): BucketKey {
  const d = daysBetween(asOf, jatuhTempo);
  if (d < 0) return 'belumJatuh';
  if (d <= 30) return 'b1_30';
  if (d <= 60) return 'b31_60';
  if (d <= 90) return 'b61_90';
  return 'above90';
}

/**
 * Selisih hari (asOf - jatuhTempo). Positif = overdue, negatif = belum jatuh.
 * Compare as UTC midnight untuk hindari drift DST.
 */
function daysBetween(asOf: Date, jatuhTempo: Date): number {
  const a = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const b = Date.UTC(jatuhTempo.getUTCFullYear(), jatuhTempo.getUTCMonth(), jatuhTempo.getUTCDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

export const __bucketInternals = { classifyBucket, daysBetween, BUCKET_KEYS };
