import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { Prisma, type JournalSource } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';
import { JOURNAL_BALANCE_STATUSES } from '../../common/gl/journal-balance-statuses.js';

export interface JejakAuditRow {
  id: string;
  tanggal: Date;
  sumber: JournalSource;
  noJurnal: string | null;
  /// Nomor dokumen sumber (faktur/tagihan/bukti kas) atau nomor jurnal.
  noDokumen: string | null;
  /// Lawan transaksi (customer/vendor/kontak).
  pihak: string | null;
  deskripsi: string;
  nilai: string;
  cabangKode: string;
  proyek: { kode: string; nama: string }[];
  /// URL bukti transaksi yang bisa diklik (dari jurnal, fallback ke dokumen sumber).
  linkBukti: string | null;
  /// Jenis + id dokumen sumber (untuk tautan ke detail dokumen di app).
  sourceType: JournalSource;
  sourceId: string | null;
}

export interface JejakAuditResponse {
  rows: JejakAuditRow[];
  total: number;
  totalNilai: string;
  /// true kalau hasil dipotong batas (take) — beri tahu user untuk mempersempit filter.
  terpotong: boolean;
}

const TAKE = 500;

/**
 * Jejak Audit — daftar transaksi (dari jurnal POSTED/REVERSED) dengan tautan
 * bukti yang bisa diklik + resolusi dokumen sumber (faktur/tagihan/kas-bank) &
 * lawan transaksi. Backing: Journal (spine transaksi) di-join ke dokumen sumber
 * lewat (sumber, sumberRef). Mempermudah pemeriksaan/audit.
 */
@Injectable()
export class JejakAuditService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async build(opts: {
    periodId?: string;
    dari?: string;
    sampai?: string;
    sumber?: JournalSource;
    projectId?: string | null;
    industriId?: string;
    cabangId?: string;
    search?: string;
  }): Promise<JejakAuditResponse> {
    return this.tenancy.run(async (tx) => {
      const where: Prisma.JournalWhereInput = { status: { in: JOURNAL_BALANCE_STATUSES } };

      if (opts.periodId) {
        const p = await tx.fiscalPeriod.findUnique({
          where: { id: opts.periodId },
          select: { startDate: true, endDate: true },
        });
        if (p) where.tanggal = { gte: p.startDate, lte: p.endDate };
      } else if (opts.dari || opts.sampai) {
        where.tanggal = {
          ...(opts.dari ? { gte: new Date(opts.dari + 'T00:00:00.000Z') } : {}),
          ...(opts.sampai ? { lte: new Date(opts.sampai + 'T00:00:00.000Z') } : {}),
        };
      }
      if (opts.sumber) where.sumber = opts.sumber;
      if (opts.cabangId) {
        this.cabangScope.assertAccess(opts.cabangId);
        where.cabangId = opts.cabangId;
      } else {
        const scope = this.cabangScope.cabangIdsForWhere();
        if (scope) where.cabangId = { in: scope };
      }
      if (opts.search) {
        where.OR = [
          { nomor: { contains: opts.search, mode: 'insensitive' } },
          { deskripsi: { contains: opts.search, mode: 'insensitive' } },
        ];
      }
      if (opts.projectId === null) where.lines = { some: { projectId: null } };
      else if (opts.projectId || opts.industriId) {
        where.lines = {
          some: {
            ...(opts.projectId ? { projectId: opts.projectId } : {}),
            ...(opts.industriId ? { project: { industriId: opts.industriId } } : {}),
          },
        };
      }

      const journals = await tx.journal.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        take: TAKE + 1,
        select: {
          id: true, tanggal: true, sumber: true, sumberRef: true, nomor: true,
          deskripsi: true, linkBukti: true, totalDebit: true,
          cabang: { select: { kode: true } },
          lines: { select: { project: { select: { kode: true, nama: true } } } },
        },
      });
      const terpotong = journals.length > TAKE;
      const page = terpotong ? journals.slice(0, TAKE) : journals;

      // Resolusi dokumen sumber (pihak + nomor + linkBukti) secara batch.
      const salesIds: string[] = [];
      const purchaseIds: string[] = [];
      const cashIds: string[] = [];
      for (const j of page) {
        if (!j.sumberRef) continue;
        if (j.sumber === 'PENJUALAN' || j.sumber === 'RETUR_JUAL') salesIds.push(j.sumberRef);
        else if (j.sumber === 'PEMBELIAN' || j.sumber === 'RETUR_BELI') purchaseIds.push(j.sumberRef);
        else if (j.sumber === 'KAS_BANK') cashIds.push(j.sumberRef);
      }
      const [sales, purchases, cash] = await Promise.all([
        salesIds.length
          ? tx.salesInvoice.findMany({ where: { id: { in: salesIds } }, select: { id: true, nomor: true, linkBukti: true, customer: { select: { nama: true } } } })
          : [],
        purchaseIds.length
          ? tx.purchaseInvoice.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, nomor: true, linkBukti: true, vendor: { select: { nama: true } } } })
          : [],
        cashIds.length
          ? tx.cashBankEntry.findMany({ where: { id: { in: cashIds } }, select: { id: true, nomor: true, linkBukti: true, kontak: true } })
          : [],
      ]);
      const sMap = new Map(sales.map((s) => [s.id, s]));
      const pMap = new Map(purchases.map((p) => [p.id, p]));
      const cMap = new Map(cash.map((c) => [c.id, c]));

      let totalNilai = new Decimal(0);
      const rows: JejakAuditRow[] = page.map((j) => {
        let noDokumen = j.nomor;
        let pihak: string | null = null;
        let srcLink: string | null = null;
        if (j.sumberRef) {
          const s = sMap.get(j.sumberRef);
          const p = pMap.get(j.sumberRef);
          const c = cMap.get(j.sumberRef);
          if (s) { noDokumen = s.nomor ?? j.nomor; pihak = s.customer?.nama ?? null; srcLink = s.linkBukti; }
          else if (p) { noDokumen = p.nomor ?? j.nomor; pihak = p.vendor?.nama ?? null; srcLink = p.linkBukti; }
          else if (c) { noDokumen = c.nomor ?? j.nomor; pihak = c.kontak ?? null; srcLink = c.linkBukti; }
        }
        const proyek = new Map<string, { kode: string; nama: string }>();
        for (const ln of j.lines) if (ln.project) proyek.set(ln.project.kode, ln.project);
        totalNilai = totalNilai.plus(new Decimal(j.totalDebit));
        return {
          id: j.id,
          tanggal: j.tanggal,
          sumber: j.sumber,
          noJurnal: j.nomor,
          noDokumen,
          pihak,
          deskripsi: j.deskripsi,
          nilai: new Decimal(j.totalDebit).toFixed(2),
          cabangKode: j.cabang.kode,
          proyek: [...proyek.values()],
          linkBukti: j.linkBukti ?? srcLink,
          sourceType: j.sumber,
          sourceId: j.sumberRef,
        };
      });

      return { rows, total: rows.length, totalNilai: totalNilai.toFixed(2), terpotong };
    });
  }
}
