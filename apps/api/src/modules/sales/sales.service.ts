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
  KlasifikasiPpn,
  PeriodStatus,
  Prisma,
} from '@lentera/db';
import type {
  CreateSalesInvoiceInput,
  SalesLineInput,
} from '@lentera/shared/schemas';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

/**
 * Skema PPN per item (sesuai PMK 131/2024):
 *   BKP / JKP  → kena PPN, DPP = bruto - diskon, tarif efektif 11% atau 12%
 *   BKP_STRATEGIS → PPN 0% (BKP dibebaskan)
 *   NON_BKP / BEBAS_PPN → tidak kena PPN
 */
function isPpnable(k: KlasifikasiPpn): boolean {
  return k === KlasifikasiPpn.BKP || k === KlasifikasiPpn.JKP;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly seq: SequenceService,
    private readonly journals: JournalsService,
    private readonly inventory: InventoryService,
    private readonly excel: ExcelService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async exportXlsx(filter: { status?: InvoiceStatus; customerId?: string; periodId?: string }): Promise<Buffer> {
    const rows = await this.list(filter);
    return this.excel.buildBuffer(
      'Penjualan',
      [
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor ?? '— DRAFT —' },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Jatuh Tempo', key: 'jatuhTempo', width: 12, format: 'date', value: (r) => r.jatuhTempo },
        { header: 'Customer', key: 'customer', width: 28,
          value: (r) => `${r.customer.kode} ${r.customer.nama}${r.customer.isPkp ? ' (PKP)' : ''}` },
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang.kode },
        { header: 'Periode', key: 'periode', width: 14, value: (r) => r.fiscalPeriod.label },
        { header: 'Termin', key: 'termin', width: 10, value: (r) => r.termin },
        { header: 'Status', key: 'status', width: 12, value: (r) => r.status },
        { header: 'DPP', key: 'dpp', width: 16, format: 'currency', value: (r) => r.totalDpp },
        { header: 'PPN', key: 'ppn', width: 14, format: 'currency', value: (r) => r.totalPpn },
        { header: 'Diskon', key: 'diskon', width: 14, format: 'currency', value: (r) => r.totalDiskon },
        { header: 'Netto', key: 'netto', width: 16, format: 'currency', value: (r) => r.totalNetto },
        { header: 'Dibayar', key: 'dibayar', width: 16, format: 'currency', value: (r) => r.totalDibayar },
      ],
      rows,
    );
  }

  // ----------------------------------------------------
  // LIST / DETAIL
  // ----------------------------------------------------

  list(filter: { status?: InvoiceStatus; customerId?: string; periodId?: string }) {
    const where: Prisma.SalesInvoiceWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.periodId) where.fiscalPeriodId = filter.periodId;
    const scope = this.cabangScope.cabangIdsForWhere();
    if (scope) where.cabangId = { in: scope };
    return this.tenancy.run((tx) =>
      tx.salesInvoice.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        take: 200,
        include: {
          customer: { select: { kode: true, nama: true, isPkp: true } },
          cabang: { select: { kode: true } },
          fiscalPeriod: { select: { label: true } },
          _count: { select: { lines: true } },
        },
      }),
    );
  }

  async byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const inv = await tx.salesInvoice.findUnique({
        where: { id },
        include: {
          customer: true,
          cabang: true,
          fiscalPeriod: true,
          akunAr: { select: { id: true, kode: true, nama: true } },
          lines: {
            orderBy: { no: 'asc' },
            include: {
              item: { select: { kode: true, nama: true } },
              akunPendapatan: { select: { kode: true, nama: true } },
            },
          },
        },
      });
      if (!inv) throw new NotFoundException('Faktur tidak ditemukan');
      this.cabangScope.assertAccess(inv.cabangId);
      const userIds = [inv.postedById, inv.postedRequestedById].filter(
        (u): u is string => !!u,
      );
      const users = userIds.length
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, nama: true },
          })
        : [];
      const byId = (uid: string | null) => users.find((u) => u.id === uid) ?? null;
      return {
        ...inv,
        postedBy: byId(inv.postedById),
        postedRequestedBy: byId(inv.postedRequestedById),
      };
    });
  }

  // ----------------------------------------------------
  // CREATE DRAFT
  // ----------------------------------------------------

  async createDraft(input: CreateSalesInvoiceInput) {
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

      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, nama: true, terminHari: true, isPkp: true },
      });
      if (!customer) throw new BadRequestException('Pelanggan tidak ditemukan');

      const jatuhTempo = input.jatuhTempo
        ? new Date(input.jatuhTempo + 'T00:00:00Z')
        : new Date(tanggal.getTime() + customer.terminHari * 86_400_000);

      const calc = this.computeTotals(input.lines, input.tarifPpnPersen);

      const inv = await tx.salesInvoice.create({
        data: {
          tenantId,
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          customerId: input.customerId,
          tanggal,
          jatuhTempo,
          termin: input.termin,
          akunArId: input.akunArId,
          deskripsi: input.deskripsi,
          kodeFakturPajak: input.kodeFakturPajak,
          nsfp: input.nsfp,
          status: InvoiceStatus.DRAFT,
          totalDpp: calc.totalDpp.toFixed(2),
          totalPpn: calc.totalPpn.toFixed(2),
          totalPph23: '0',                    // PPh 23 dipotong customer, bukan kita
          totalDiskon: calc.totalDiskon.toFixed(2),
          totalNetto: calc.totalDpp.plus(calc.totalPpn).toFixed(2),
          createdById: userId,
          lines: {
            create: input.lines.map((l, i) => {
              const c = calc.perLine[i]!;
              return {
                tenantId,
                no: i + 1,
                itemId: l.itemId ?? null,
                deskripsi: l.deskripsi,
                qty: l.qty,
                satuan: l.satuan,
                hargaSatuan: l.hargaSatuan,
                diskonPersen: l.diskonPersen,
                klasifikasiPpn: l.klasifikasiPpn,
                isJasa: l.isJasa,
                bruto: c.bruto.toFixed(2),
                diskonNilai: c.diskonNilai.toFixed(2),
                dpp: c.dpp.toFixed(2),
                ppn: c.ppn.toFixed(2),
                pph23: '0',
                akunPendapatanId: l.akunPendapatanId,
              };
            }),
          },
        },
        include: { lines: true },
      });
      return inv;
    });
  }

  // ----------------------------------------------------
  // UPDATE DRAFT (hanya status DRAFT)
  // ----------------------------------------------------

  async updateDraft(id: string, input: CreateSalesInvoiceInput) {
    const tenantId = this.ctx.require().tenantId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');
    return this.tenancy.run(async (tx) => {
      const existing = await tx.salesInvoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Faktur tidak ditemukan');
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
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { terminHari: true },
      });
      if (!customer) throw new BadRequestException('Pelanggan tidak ditemukan');
      const jatuhTempo = input.jatuhTempo
        ? new Date(input.jatuhTempo + 'T00:00:00Z')
        : new Date(tanggal.getTime() + customer.terminHari * 86_400_000);

      const calc = this.computeTotals(input.lines, input.tarifPpnPersen);

      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: id } });
      return tx.salesInvoice.update({
        where: { id },
        data: {
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          customerId: input.customerId,
          tanggal,
          jatuhTempo,
          termin: input.termin,
          akunArId: input.akunArId,
          deskripsi: input.deskripsi,
          kodeFakturPajak: input.kodeFakturPajak,
          nsfp: input.nsfp,
          totalDpp: calc.totalDpp.toFixed(2),
          totalPpn: calc.totalPpn.toFixed(2),
          totalPph23: '0',
          totalDiskon: calc.totalDiskon.toFixed(2),
          totalNetto: calc.totalDpp.plus(calc.totalPpn).toFixed(2),
          lines: {
            create: input.lines.map((l, i) => {
              const c = calc.perLine[i]!;
              return {
                tenantId,
                no: i + 1,
                itemId: l.itemId ?? null,
                deskripsi: l.deskripsi,
                qty: l.qty,
                satuan: l.satuan,
                hargaSatuan: l.hargaSatuan,
                diskonPersen: l.diskonPersen,
                klasifikasiPpn: l.klasifikasiPpn,
                isJasa: l.isJasa,
                bruto: c.bruto.toFixed(2),
                diskonNilai: c.diskonNilai.toFixed(2),
                dpp: c.dpp.toFixed(2),
                ppn: c.ppn.toFixed(2),
                pph23: '0',
                akunPendapatanId: l.akunPendapatanId,
              };
            }),
          },
        },
        include: { lines: true },
      });
    });
  }

  // ----------------------------------------------------
  // POST: DRAFT → POSTED + auto-post jurnal
  // ----------------------------------------------------

  async post(id: string, requestedById?: string | null) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      if (requestedById && requestedById !== userId) {
        const membership = await tx.membership.findUnique({
          where: { userId_tenantId: { userId: requestedById, tenantId } },
          select: { userId: true },
        });
        if (!membership) {
          throw new BadRequestException('Requester (X-Requested-By) bukan anggota tenant');
        }
      }
      const inv = await tx.salesInvoice.findUnique({
        where: { id },
        include: {
          lines: true,
          customer: { select: { nama: true, akunPiutangId: true } },
          akunAr: { select: { kode: true } },
        },
      });
      if (!inv) throw new NotFoundException('Faktur tidak ditemukan');
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(`Faktur status ${inv.status}, tidak bisa di-post`);
      }
      await this.assertPeriodOpen(tx, inv.tanggal);

      // Alokasi nomor INV
      const nomor = inv.nomor ?? (await this.seq.next(tx, 'INV', inv.tanggal));

      // ---- Bangun journal lines ----
      // Sisi DEBIT: akun AR (piutang atau kas/bank) sebesar totalNetto
      // Sisi KREDIT: pendapatan per akun (group), PPN keluaran (utang PPN)
      const totalNetto = new Decimal(inv.totalNetto);

      const lines: Array<{
        accountId: string; debit: string; kredit: string; deskripsi?: string;
      }> = [];
      lines.push({
        accountId: inv.akunArId,
        debit: totalNetto.toFixed(2),
        kredit: '0',
        deskripsi: `Faktur ${nomor} — ${inv.customer.nama}`,
      });

      // Group pendapatan per akun
      const pendapatanByAccount = new Map<string, Decimal>();
      for (const l of inv.lines) {
        const cur = pendapatanByAccount.get(l.akunPendapatanId) ?? new Decimal(0);
        // Pendapatan diakui sebesar DPP (bukan bruto, karena diskon mengurangi pendapatan).
        pendapatanByAccount.set(
          l.akunPendapatanId,
          cur.plus(new Decimal(l.dpp)),
        );
      }
      for (const [accountId, nilai] of pendapatanByAccount) {
        if (nilai.gt(0)) {
          lines.push({
            accountId,
            debit: '0',
            kredit: nilai.toFixed(2),
            deskripsi: 'Pendapatan dari faktur',
          });
        }
      }

      // PPN keluaran (kalau ada)
      const totalPpn = new Decimal(inv.totalPpn);
      if (totalPpn.gt(0)) {
        const akunUtangPpn = await tx.taxRate.findFirst({
          where: { kode: 'PPN-EFEKTIF-11' },
          select: { akunUtangId: true },
        });
        if (!akunUtangPpn?.akunUtangId) {
          throw new BadRequestException(
            'Akun Utang PPN belum di-set di tarif PPN-EFEKTIF-11',
          );
        }
        lines.push({
          accountId: akunUtangPpn.akunUtangId,
          debit: '0',
          kredit: totalPpn.toFixed(2),
          deskripsi: 'PPN Keluaran',
        });
      }

      // ---- Buat draft jurnal lalu post (SATU transaksi outer) ----
      const journal = await this.journals.createDraftInTx(tx, {
        cabangId: inv.cabangId,
        tanggal: inv.tanggal.toISOString().slice(0, 10),
        deskripsi: `Faktur penjualan ${nomor}`,
        sumber: JournalSource.PENJUALAN,
        sumberRef: inv.id,
        lines,
      });
      await this.journals.postInTx(tx, journal.id);

      // ---- Record stok outbound + auto-jurnal HPP untuk item barang ----
      let hppJournalId: string | null = null;
      const itemLines = await tx.salesInvoiceLine.findMany({
        where: {
          invoiceId: id,
          itemId: { not: null },
          isJasa: false,
        },
        include: {
          item: {
            select: { id: true, kode: true, akunHppId: true, akunPersediaanId: true },
          },
        },
      });
      if (itemLines.length > 0) {
        const hppPerAkun = new Map<string, Decimal>();      // akunHpp → sum
        const persediaanPerAkun = new Map<string, Decimal>(); // akunPersediaan → sum
        for (const l of itemLines) {
          if (!l.item || !l.item.akunHppId || !l.item.akunPersediaanId) continue;
          const res = await this.inventory.recordOutbound(tx, {
            itemId: l.item.id,
            cabangId: inv.cabangId,
            tanggal: inv.tanggal,
            qty: new Decimal(l.qty),
            tipe: 'PENJUALAN',
            sumberType: 'SALES_LINE',
            sumberId: l.id,
            keterangan: `Penjualan ${nomor}`,
          });
          hppPerAkun.set(l.item.akunHppId,
            (hppPerAkun.get(l.item.akunHppId) ?? new Decimal(0)).plus(res.hpp));
          persediaanPerAkun.set(l.item.akunPersediaanId,
            (persediaanPerAkun.get(l.item.akunPersediaanId) ?? new Decimal(0)).plus(res.hpp));
        }
        // Jurnal HPP terpisah: D HPP, K Persediaan.
        const hppLines: Array<{ accountId: string; debit: string; kredit: string; deskripsi?: string }> = [];
        for (const [aid, n] of hppPerAkun) {
          if (n.gt(0)) hppLines.push({ accountId: aid, debit: n.toFixed(2), kredit: '0', deskripsi: 'HPP penjualan' });
        }
        for (const [aid, n] of persediaanPerAkun) {
          if (n.gt(0)) hppLines.push({ accountId: aid, debit: '0', kredit: n.toFixed(2), deskripsi: 'Kurangi persediaan' });
        }
        if (hppLines.length >= 2) {
          const hppJournal = await this.journals.createDraftInTx(tx, {
            cabangId: inv.cabangId,
            tanggal: inv.tanggal.toISOString().slice(0, 10),
            deskripsi: `HPP penjualan ${nomor}`,
            sumber: JournalSource.PENJUALAN,
            sumberRef: inv.id,
            lines: hppLines,
          });
          await this.journals.postInTx(tx, hppJournal.id);
          hppJournalId = hppJournal.id;
        }
      }

      return tx.salesInvoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.POSTED,
          nomor,
          journalId: journal.id,
          hppJournalId,
          postedAt: new Date(),
          postedById: userId,
          postedRequestedById: requestedById && requestedById !== userId ? requestedById : null,
        },
      });
    });
  }

  // ----------------------------------------------------
  // CANCEL: kalau POSTED → reverse jurnal; status → CANCELLED
  // ----------------------------------------------------

  async cancel(id: string, alasan: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const inv = await tx.salesInvoice.findUnique({
        where: { id },
        include: { customer: { select: { nama: true } } },
      });
      if (!inv) throw new NotFoundException('Faktur tidak ditemukan');
      if (inv.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('Faktur sudah dibatalkan');
      }
      if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.PARTIAL) {
        throw new BadRequestException(
          'Faktur sudah ada pelunasan — batalkan pembayaran dulu',
        );
      }
      if (inv.status === InvoiceStatus.POSTED) {
        // Reverse jurnal utama + jurnal HPP + stok movements (SATU transaksi).
        if (inv.journalId) {
          await this.journals.reverseInTx(tx, inv.journalId, {
            alasan: `Pembatalan faktur ${inv.nomor}: ${alasan}`,
          });
        }
        if (inv.hppJournalId) {
          await this.journals.reverseInTx(tx, inv.hppJournalId, {
            alasan: `Pembatalan HPP ${inv.nomor}: ${alasan}`,
          });
        }
        // Stok movements dibikin per LINE dengan sumberId=line.id — reverse per line.
        const lineIds = await tx.salesInvoiceLine.findMany({
          where: { invoiceId: inv.id }, select: { id: true },
        });
        for (const { id: lineId } of lineIds) {
          await this.inventory.reverseInbound(tx, 'SALES_LINE', lineId, new Date());
        }
      }
      return tx.salesInvoice.update({
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
      const inv = await tx.salesInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException();
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Hanya DRAFT yang bisa dihapus');
      }
      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.salesInvoice.delete({ where: { id } });
    });
  }

  // ----------------------------------------------------
  // Helpers
  // ----------------------------------------------------

  private computeTotals(lines: SalesLineInput[], tarifPpn: number) {
    const t = new Decimal(tarifPpn).div(100);
    const perLine = lines.map((l) => {
      const qty = new Decimal(l.qty);
      const harga = new Decimal(l.hargaSatuan);
      const bruto = qty.mul(harga);
      const diskon = bruto.mul(new Decimal(l.diskonPersen).div(100)).toDecimalPlaces(2);
      const dpp = bruto.minus(diskon);
      // PPN: efektif 11% untuk PMK 131/2024 default (DPP nilai lain 11/12 × 12%)
      // Kalau tarif user pilih 12 → asumsi DPP penuh × 12% (BKP mewah)
      let ppn = new Decimal(0);
      if (isPpnable(l.klasifikasiPpn)) {
        if (tarifPpn === 11) {
          // DPP nilai lain: 11/12 × DPP × 12% = DPP × 11%
          ppn = dpp.mul(new Decimal(11).div(12)).mul(new Decimal(12).div(100)).toDecimalPlaces(2);
        } else {
          ppn = dpp.mul(t).toDecimalPlaces(2);
        }
      }
      return { bruto, diskonNilai: diskon, dpp, ppn };
    });
    const totalDpp = perLine.reduce((a, c) => a.plus(c.dpp), new Decimal(0));
    const totalPpn = perLine.reduce((a, c) => a.plus(c.ppn), new Decimal(0));
    const totalDiskon = perLine.reduce((a, c) => a.plus(c.diskonNilai), new Decimal(0));
    return { perLine, totalDpp, totalPpn, totalDiskon };
  }

  private async assertPeriodOpen(tx: Prisma.TransactionClient, tanggal: Date) {
    const p = await tx.fiscalPeriod.findFirst({
      where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
    });
    if (!p) throw new BadRequestException('Tanggal di luar tahun buku');
    if (p.status === PeriodStatus.CLOSED) {
      throw new ForbiddenException(`Periode ${p.label} sudah ditutup`);
    }
  }
}
