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
  CreatePurchaseInvoiceInput,
  PurchaseLineInput,
} from '@lentera/shared/schemas';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { BuktiPotongService } from '../bukti-potong/bukti-potong.service.js';

const isPpnable = (k: KlasifikasiPpn) =>
  k === KlasifikasiPpn.BKP || k === KlasifikasiPpn.JKP;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly seq: SequenceService,
    private readonly journals: JournalsService,
    private readonly inventory: InventoryService,
    private readonly buktiPotong: BuktiPotongService,
    private readonly excel: ExcelService,
  ) {}

  async exportXlsx(filter: { status?: InvoiceStatus; vendorId?: string; periodId?: string }): Promise<Buffer> {
    const rows = await this.list(filter);
    return this.excel.buildBuffer(
      'Pembelian',
      [
        { header: 'Nomor', key: 'nomor', width: 18, value: (r) => r.nomor ?? '— DRAFT —' },
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Jatuh Tempo', key: 'jatuhTempo', width: 12, format: 'date', value: (r) => r.jatuhTempo },
        { header: 'Nomor Vendor', key: 'nomorVendor', width: 16, value: (r) => r.nomorVendor ?? '' },
        { header: 'Vendor', key: 'vendor', width: 28,
          value: (r) => `${r.vendor.kode} ${r.vendor.nama}${r.vendor.isPkp ? ' (PKP)' : ''}` },
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang.kode },
        { header: 'Periode', key: 'periode', width: 14, value: (r) => r.fiscalPeriod.label },
        { header: 'Termin', key: 'termin', width: 10, value: (r) => r.termin },
        { header: 'Status', key: 'status', width: 12, value: (r) => r.status },
        { header: 'DPP', key: 'dpp', width: 16, format: 'currency', value: (r) => r.totalDpp },
        { header: 'PPN', key: 'ppn', width: 14, format: 'currency', value: (r) => r.totalPpn },
        { header: 'PPh 23', key: 'pph23', width: 14, format: 'currency', value: (r) => r.totalPph23 },
        { header: 'Diskon', key: 'diskon', width: 14, format: 'currency', value: (r) => r.totalDiskon },
        { header: 'Netto', key: 'netto', width: 16, format: 'currency', value: (r) => r.totalNetto },
        { header: 'Dibayar', key: 'dibayar', width: 16, format: 'currency', value: (r) => r.totalDibayar },
      ],
      rows,
    );
  }

  list(filter: { status?: InvoiceStatus; vendorId?: string; periodId?: string }) {
    const where: Prisma.PurchaseInvoiceWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.vendorId) where.vendorId = filter.vendorId;
    if (filter.periodId) where.fiscalPeriodId = filter.periodId;
    return this.tenancy.run((tx) =>
      tx.purchaseInvoice.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        take: 200,
        include: {
          vendor: { select: { kode: true, nama: true, isPkp: true } },
          cabang: { select: { kode: true } },
          fiscalPeriod: { select: { label: true } },
          _count: { select: { lines: true } },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const inv = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: {
          vendor: true,
          cabang: true,
          fiscalPeriod: true,
          akunAp: { select: { id: true, kode: true, nama: true } },
          lines: {
            orderBy: { no: 'asc' },
            include: {
              item: { select: { kode: true, nama: true } },
              akunDebit: { select: { kode: true, nama: true } },
            },
          },
        },
      });
      if (!inv) throw new NotFoundException('Tagihan tidak ditemukan');
      return inv;
    });
  }

  async createDraft(input: CreatePurchaseInvoiceInput) {
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

      const vendor = await tx.vendor.findUnique({
        where: { id: input.vendorId },
        select: { id: true, isPkp: true, terminHari: true, npwp: true, nama: true },
      });
      if (!vendor) throw new BadRequestException('Vendor tidak ditemukan');

      const jatuhTempo = input.jatuhTempo
        ? new Date(input.jatuhTempo + 'T00:00:00Z')
        : new Date(tanggal.getTime() + vendor.terminHari * 86_400_000);

      const calc = this.computeTotals(input.lines, {
        tarifPpn: input.tarifPpnPersen,
        // PPN masukan hanya kalau vendor PKP
        applyPpn: vendor.isPkp,
        potongPph23: input.potongPph23,
        tarifPph23: input.tarifPph23Persen,
        vendorPunyaNpwp: !!vendor.npwp,
      });

      const totalNetto = calc.totalDpp.plus(calc.totalPpn).minus(calc.totalPph23);

      const inv = await tx.purchaseInvoice.create({
        data: {
          tenantId,
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          vendorId: input.vendorId,
          tanggal,
          jatuhTempo,
          termin: input.termin,
          akunApId: input.akunApId,
          nomorVendor: input.nomorVendor,
          nsfpMasukan: input.nsfpMasukan,
          deskripsi: input.deskripsi,
          status: InvoiceStatus.DRAFT,
          totalDpp: calc.totalDpp.toFixed(2),
          totalPpn: calc.totalPpn.toFixed(2),
          totalPph23: calc.totalPph23.toFixed(2),
          totalDiskon: calc.totalDiskon.toFixed(2),
          totalNetto: totalNetto.toFixed(2),
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
                pph23: c.pph23.toFixed(2),
                akunDebitId: l.akunDebitId,
              };
            }),
          },
        },
        include: { lines: true },
      });
      return inv;
    });
  }

  async updateDraft(id: string, input: CreatePurchaseInvoiceInput) {
    const tenantId = this.ctx.require().tenantId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');
    return this.tenancy.run(async (tx) => {
      const existing = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Tagihan tidak ditemukan');
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
      const vendor = await tx.vendor.findUnique({
        where: { id: input.vendorId },
        select: { isPkp: true, terminHari: true, npwp: true },
      });
      if (!vendor) throw new BadRequestException('Vendor tidak ditemukan');
      const jatuhTempo = input.jatuhTempo
        ? new Date(input.jatuhTempo + 'T00:00:00Z')
        : new Date(tanggal.getTime() + vendor.terminHari * 86_400_000);

      const calc = this.computeTotals(input.lines, {
        tarifPpn: input.tarifPpnPersen,
        applyPpn: vendor.isPkp,
        potongPph23: input.potongPph23,
        tarifPph23: input.tarifPph23Persen,
        vendorPunyaNpwp: !!vendor.npwp,
      });
      const totalNetto = calc.totalDpp.plus(calc.totalPpn).minus(calc.totalPph23);

      await tx.purchaseInvoiceLine.deleteMany({ where: { invoiceId: id } });
      return tx.purchaseInvoice.update({
        where: { id },
        data: {
          cabangId: input.cabangId,
          fiscalPeriodId: period.id,
          vendorId: input.vendorId,
          tanggal,
          jatuhTempo,
          termin: input.termin,
          akunApId: input.akunApId,
          nomorVendor: input.nomorVendor,
          nsfpMasukan: input.nsfpMasukan,
          deskripsi: input.deskripsi,
          totalDpp: calc.totalDpp.toFixed(2),
          totalPpn: calc.totalPpn.toFixed(2),
          totalPph23: calc.totalPph23.toFixed(2),
          totalDiskon: calc.totalDiskon.toFixed(2),
          totalNetto: totalNetto.toFixed(2),
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
                pph23: c.pph23.toFixed(2),
                akunDebitId: l.akunDebitId,
              };
            }),
          },
        },
        include: { lines: true },
      });
    });
  }

  async post(id: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const inv = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: { lines: true, vendor: { select: { nama: true, isPkp: true } } },
      });
      if (!inv) throw new NotFoundException();
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(`Status ${inv.status}, tidak bisa di-post`);
      }
      await this.assertPeriodOpen(tx, inv.tanggal);

      const nomor = inv.nomor ?? (await this.seq.next(tx, 'BILL', inv.tanggal));

      // Bangun journal lines:
      // DEBIT:  Persediaan/Beban per line (sebesar DPP), PPN Masukan (kalau ada)
      // KREDIT: Utang Usaha / Kas-Bank (totalNetto), Utang PPh 23 (kalau ada)
      const lines: Array<{ accountId: string; debit: string; kredit: string; deskripsi?: string }> = [];

      // Debit per akun line
      const debitByAccount = new Map<string, Decimal>();
      for (const l of inv.lines) {
        const cur = debitByAccount.get(l.akunDebitId) ?? new Decimal(0);
        debitByAccount.set(l.akunDebitId, cur.plus(new Decimal(l.dpp)));
      }
      for (const [accountId, nilai] of debitByAccount) {
        if (nilai.gt(0)) {
          lines.push({
            accountId,
            debit: nilai.toFixed(2),
            kredit: '0',
            deskripsi: 'Tagihan pembelian',
          });
        }
      }

      // PPN Masukan
      const totalPpn = new Decimal(inv.totalPpn);
      if (totalPpn.gt(0)) {
        const taxRate = await tx.taxRate.findFirst({
          where: { kode: 'PPN-EFEKTIF-11' },
          select: { akunPiutangId: true },
        });
        if (!taxRate?.akunPiutangId) {
          throw new BadRequestException('Akun PPN Masukan belum di-set di tarif PPN');
        }
        lines.push({
          accountId: taxRate.akunPiutangId,
          debit: totalPpn.toFixed(2),
          kredit: '0',
          deskripsi: 'PPN Masukan',
        });
      }

      // Utang Usaha / Kas-Bank (akun AP) — totalNetto
      const totalNetto = new Decimal(inv.totalNetto);
      lines.push({
        accountId: inv.akunApId,
        debit: '0',
        kredit: totalNetto.toFixed(2),
        deskripsi: `Tagihan ${nomor} — ${inv.vendor.nama}`,
      });

      // PPh 23 (kalau ada) — kita potong dari pembayaran (kredit ke Utang PPh 23)
      const totalPph23 = new Decimal(inv.totalPph23);
      if (totalPph23.gt(0)) {
        const taxRate = await tx.taxRate.findFirst({
          where: { kode: 'PPH23-JASA' },
          select: { akunUtangId: true },
        });
        if (!taxRate?.akunUtangId) {
          throw new BadRequestException('Akun Utang PPh 23 belum di-set');
        }
        lines.push({
          accountId: taxRate.akunUtangId,
          debit: '0',
          kredit: totalPph23.toFixed(2),
          deskripsi: 'PPh 23 yang dipotong',
        });
      }

      const journal = await this.journals.createDraftInTx(tx, {
        cabangId: inv.cabangId,
        tanggal: inv.tanggal.toISOString().slice(0, 10),
        deskripsi: `Tagihan pembelian ${nomor}`,
        sumber: JournalSource.PEMBELIAN,
        sumberRef: inv.id,
        lines,
      });
      await this.journals.postInTx(tx, journal.id);

      // ---- Record stok inbound per item barang ----
      const itemLines = await tx.purchaseInvoiceLine.findMany({
        where: { invoiceId: id, itemId: { not: null }, isJasa: false },
      });
      for (const l of itemLines) {
        if (!l.itemId) continue;
        const qty = new Decimal(l.qty);
        if (qty.lte(0)) continue;
        const hargaPokokPerUnit = new Decimal(l.dpp).div(qty);
        await this.inventory.recordInbound(tx, {
          itemId: l.itemId,
          cabangId: inv.cabangId,
          tanggal: inv.tanggal,
          qty,
          hargaPokok: hargaPokokPerUnit,
          tipe: 'PEMBELIAN',
          sumberType: 'PURCHASE_LINE',
          sumberId: l.id,
          keterangan: `Pembelian ${nomor}`,
        });
      }

      // Auto-generate Bukti Potong PPh 23 untuk baris jasa yang ada PPh 23.
      await this.buktiPotong.generateFromPurchaseInvoice(tx, id);

      return tx.purchaseInvoice.update({
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
      const inv = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException();
      if (inv.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('Sudah dibatalkan');
      }
      if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.PARTIAL) {
        throw new BadRequestException('Sudah ada pembayaran — batalkan pembayaran dulu');
      }
      if (inv.status === InvoiceStatus.POSTED) {
        if (inv.journalId) {
          await this.journals.reverseInTx(tx, inv.journalId, {
            alasan: `Pembatalan ${inv.nomor}: ${alasan}`,
          });
        }
        // Reverse stok inbound (keluar barang yang masuk dari faktur ini).
        await this.inventory.reverseInbound(tx, 'PURCHASE_LINE', inv.id, new Date());
      }
      return tx.purchaseInvoice.update({
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
      const inv = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException();
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Hanya DRAFT yang bisa dihapus');
      }
      await tx.purchaseInvoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.purchaseInvoice.delete({ where: { id } });
    });
  }

  private computeTotals(
    lines: PurchaseLineInput[],
    opts: {
      tarifPpn: number;
      applyPpn: boolean;
      potongPph23: boolean;
      tarifPph23: number;
      vendorPunyaNpwp: boolean;
    },
  ) {
    const perLine = lines.map((l) => {
      const qty = new Decimal(l.qty);
      const harga = new Decimal(l.hargaSatuan);
      const bruto = qty.mul(harga);
      const diskon = bruto.mul(new Decimal(l.diskonPersen).div(100)).toDecimalPlaces(2);
      const dpp = bruto.minus(diskon);

      // PPN
      let ppn = new Decimal(0);
      if (opts.applyPpn && isPpnable(l.klasifikasiPpn)) {
        if (opts.tarifPpn === 11) {
          ppn = dpp.mul(new Decimal(11).div(12)).mul(new Decimal(12).div(100)).toDecimalPlaces(2);
        } else {
          ppn = dpp.mul(new Decimal(opts.tarifPpn).div(100)).toDecimalPlaces(2);
        }
      }

      // PPh 23 — hanya untuk jasa, dan hanya kalau kita memang memotong.
      let pph23 = new Decimal(0);
      if (opts.potongPph23 && l.isJasa) {
        const tarifEfektif = opts.vendorPunyaNpwp
          ? new Decimal(opts.tarifPph23)
          : new Decimal(opts.tarifPph23).mul(2); // surcharge 100% tanpa NPWP
        pph23 = dpp.mul(tarifEfektif).div(100).toDecimalPlaces(0);
      }

      return { bruto, diskonNilai: diskon, dpp, ppn, pph23 };
    });
    const totalDpp = perLine.reduce((a, c) => a.plus(c.dpp), new Decimal(0));
    const totalPpn = perLine.reduce((a, c) => a.plus(c.ppn), new Decimal(0));
    const totalPph23 = perLine.reduce((a, c) => a.plus(c.pph23), new Decimal(0));
    const totalDiskon = perLine.reduce((a, c) => a.plus(c.diskonNilai), new Decimal(0));
    return { perLine, totalDpp, totalPpn, totalPph23, totalDiskon };
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
