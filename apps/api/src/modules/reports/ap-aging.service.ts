import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { InvoiceStatus, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

/**
 * Aging Utang (AP) — mirror ArAgingService, tapi dari faktur pembelian.
 * Sisa dihitung `totalNetto - Σ pembayaran (CashBankEntry POSTED, tanggal ≤ asOf)`.
 * `totalNetto` sudah mengurangi PPh 23 (dipotong dari pembayaran).
 */

export interface ApAgingBuckets {
  belumJatuh: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  above90: string;
}

export interface ApAgingRow {
  vendorId: string;
  kode: string;
  nama: string;
  saldo: string;
  buckets: ApAgingBuckets;
  jumlahFaktur: number;
}

export interface ApAgingResponse {
  asOf: string;
  cabangId?: string;
  totalSaldo: string;
  totalBuckets: ApAgingBuckets;
  rows: ApAgingRow[];
}

export interface ApStatementInvoice {
  id: string;
  nomor: string | null;
  tanggal: string;
  jatuhTempo: string;
  totalNetto: string;
  dibayar: string;
  sisa: string;
  daysOverdue: number;
  status: InvoiceStatus;
  bucket: keyof ApAgingBuckets;
  payments: Array<{
    id: string;
    nomor: string | null;
    tanggal: string;
    total: string;
  }>;
}

export interface ApStatementResponse {
  asOf: string;
  vendor: { id: string; kode: string; nama: string };
  totalSaldo: string;
  totalBuckets: ApAgingBuckets;
  invoices: ApStatementInvoice[];
}

@Injectable()
export class ApAgingService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async build(opts: { asOf: string; cabangId?: string }): Promise<ApAgingResponse> {
    return this.tenancy.run(async (tx) => {
      if (opts.cabangId) this.cabangScope.assertAccess(opts.cabangId);
      const asOfDate = parseDate(opts.asOf);
      const invoices = await this.fetchOpenInvoices(tx, asOfDate, opts.cabangId);

      const perVendor = new Map<
        string,
        { vendor: { id: string; kode: string; nama: string }; saldo: Decimal; buckets: BucketAcc; count: number }
      >();

      for (const inv of invoices) {
        const bucket = classifyBucket(asOfDate, inv.jatuhTempo);
        const cur = perVendor.get(inv.vendor.id) ?? {
          vendor: inv.vendor,
          saldo: new Decimal(0),
          buckets: emptyBucketAcc(),
          count: 0,
        };
        cur.saldo = cur.saldo.plus(inv.sisa);
        cur.buckets[bucket] = cur.buckets[bucket].plus(inv.sisa);
        cur.count += 1;
        perVendor.set(inv.vendor.id, cur);
      }

      const rows: ApAgingRow[] = Array.from(perVendor.values())
        .sort((a, b) => b.saldo.cmp(a.saldo))
        .map((v) => ({
          vendorId: v.vendor.id,
          kode: v.vendor.kode,
          nama: v.vendor.nama,
          saldo: v.saldo.toFixed(2),
          buckets: serializeBucketAcc(v.buckets),
          jumlahFaktur: v.count,
        }));

      const totalBuckets = emptyBucketAcc();
      let totalSaldo = new Decimal(0);
      for (const v of perVendor.values()) {
        totalSaldo = totalSaldo.plus(v.saldo);
        for (const k of BUCKET_KEYS) totalBuckets[k] = totalBuckets[k].plus(v.buckets[k]);
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
    vendorId: string;
    asOf: string;
    cabangId?: string;
  }): Promise<ApStatementResponse> {
    return this.tenancy.run(async (tx) => {
      if (opts.cabangId) this.cabangScope.assertAccess(opts.cabangId);
      const asOfDate = parseDate(opts.asOf);

      const vendor = await tx.vendor.findUnique({
        where: { id: opts.vendorId },
        select: { id: true, kode: true, nama: true },
      });
      if (!vendor) throw new NotFoundException('Vendor tidak ditemukan');

      const invoices = await this.fetchOpenInvoices(tx, asOfDate, opts.cabangId, opts.vendorId);
      const paymentsByInvoice = await this.fetchPayments(tx, invoices.map((i) => i.id), asOfDate);

      const invRows: ApStatementInvoice[] = invoices
        .sort((a, b) => a.tanggal.getTime() - b.tanggal.getTime())
        .map((inv) => ({
          id: inv.id,
          nomor: inv.nomor,
          tanggal: inv.tanggal.toISOString().slice(0, 10),
          jatuhTempo: inv.jatuhTempo.toISOString().slice(0, 10),
          totalNetto: inv.totalNetto.toFixed(2),
          dibayar: inv.dibayar.toFixed(2),
          sisa: inv.sisa.toFixed(2),
          daysOverdue: daysBetween(asOfDate, inv.jatuhTempo),
          status: inv.status,
          bucket: classifyBucket(asOfDate, inv.jatuhTempo),
          payments: (paymentsByInvoice.get(inv.id) ?? []).map((p) => ({
            id: p.id,
            nomor: p.nomor,
            tanggal: p.tanggal.toISOString().slice(0, 10),
            total: p.total.toFixed(2),
          })),
        }));

      const totalBuckets = emptyBucketAcc();
      let totalSaldo = new Decimal(0);
      for (const inv of invoices) {
        const b = classifyBucket(asOfDate, inv.jatuhTempo);
        totalBuckets[b] = totalBuckets[b].plus(inv.sisa);
        totalSaldo = totalSaldo.plus(inv.sisa);
      }

      return {
        asOf: opts.asOf,
        vendor,
        totalSaldo: totalSaldo.toFixed(2),
        totalBuckets: serializeBucketAcc(totalBuckets),
        invoices: invRows,
      };
    });
  }

  // ---------------------------------------------------------------

  private async fetchOpenInvoices(
    tx: Prisma.TransactionClient,
    asOf: Date,
    cabangId?: string,
    vendorId?: string,
  ) {
    const allowed = this.cabangScope.cabangIdsForWhere();
    const cabangFilter =
      cabangId != null
        ? { cabangId }
        : allowed
          ? { cabangId: { in: allowed } }
          : {};

    const invs = await tx.purchaseInvoice.findMany({
      where: {
        ...cabangFilter,
        ...(vendorId ? { vendorId } : {}),
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
        vendor: { select: { id: true, kode: true, nama: true } },
      },
    });
    if (invs.length === 0) return [];

    const paidAggregates = await tx.cashBankEntry.groupBy({
      by: ['purchaseInvoiceId'],
      where: {
        purchaseInvoiceId: { in: invs.map((i) => i.id) },
        status: InvoiceStatus.POSTED,
        tanggal: { lte: asOf },
      },
      _sum: { total: true },
    });
    const paidMap = new Map<string, Decimal>();
    for (const p of paidAggregates) {
      if (p.purchaseInvoiceId) paidMap.set(p.purchaseInvoiceId, new Decimal(p._sum.total ?? 0));
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
          vendor: i.vendor,
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
        purchaseInvoiceId: { in: invoiceIds },
        status: InvoiceStatus.POSTED,
        tanggal: { lte: asOf },
      },
      select: { id: true, nomor: true, tanggal: true, total: true, purchaseInvoiceId: true },
      orderBy: { tanggal: 'asc' },
    });
    const map = new Map<string, Array<{ id: string; nomor: string | null; tanggal: Date; total: Decimal }>>();
    for (const r of rows) {
      if (!r.purchaseInvoiceId) continue;
      const arr = map.get(r.purchaseInvoiceId) ?? [];
      arr.push({ id: r.id, nomor: r.nomor, tanggal: r.tanggal, total: new Decimal(r.total) });
      map.set(r.purchaseInvoiceId, arr);
    }
    return map;
  }
}

// -----------------------------------------------------------------
// Bucket helpers (duplicated dari AR aging supaya tiap service self-contained)
// -----------------------------------------------------------------

const BUCKET_KEYS = ['belumJatuh', 'b1_30', 'b31_60', 'b61_90', 'above90'] as const;
type BucketKey = (typeof BUCKET_KEYS)[number];
type BucketAcc = Record<BucketKey, Decimal>;

function emptyBucketAcc(): BucketAcc {
  return { belumJatuh: new Decimal(0), b1_30: new Decimal(0), b31_60: new Decimal(0), b61_90: new Decimal(0), above90: new Decimal(0) };
}

function serializeBucketAcc(b: BucketAcc): ApAgingBuckets {
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

function daysBetween(asOf: Date, jatuhTempo: Date): number {
  const a = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const b = Date.UTC(jatuhTempo.getUTCFullYear(), jatuhTempo.getUTCMonth(), jatuhTempo.getUTCDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

function parseDate(iso: string): Date {
  const d = new Date(`${iso}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) throw new NotFoundException(`asOf invalid: ${iso}`);
  return d;
}
