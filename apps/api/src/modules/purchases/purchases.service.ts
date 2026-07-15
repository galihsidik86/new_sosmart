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
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';
import { resolvePpnAccountId } from '../../common/gl-config/ppn-account.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { validateRequestedBy } from '../../common/tenancy/step-up.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { BuktiPotongService } from '../bukti-potong/bukti-potong.service.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import { ApprovalService } from '../approval/approval.service.js';

const isPpnable = (k: KlasifikasiPpn) =>
  k === KlasifikasiPpn.BKP || k === KlasifikasiPpn.JKP;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly seq: SequenceService,
    private readonly journals: JournalsService,
    private readonly inventory: InventoryService,
    private readonly buktiPotong: BuktiPotongService,
    private readonly excel: ExcelService,
    private readonly cabangScope: CabangScopeService,
    private readonly glConfig: GlConfigService,
    private readonly approval: ApprovalService,
  ) {}

  async exportXlsx(filter: {
    status?: InvoiceStatus;
    vendorId?: string;
    periodId?: string;
    cabangId?: string;
    projectId?: string;
    industriId?: string;
    search?: string;
  }): Promise<Buffer> {
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

  list(filter: {
    status?: InvoiceStatus;
    vendorId?: string;
    periodId?: string;
    cabangId?: string;
    projectId?: string;
    industriId?: string;
    search?: string;
  }) {
    const where: Prisma.PurchaseInvoiceWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.vendorId) where.vendorId = filter.vendorId;
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
        { nomorVendor: { contains: q, mode: 'insensitive' } },
        { deskripsi: { contains: q, mode: 'insensitive' } },
        { vendor: { nama: { contains: q, mode: 'insensitive' } } },
        { vendor: { kode: { contains: q, mode: 'insensitive' } } },
      ];
    }
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

  async byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const inv = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: {
          vendor: true,
          cabang: true,
          fiscalPeriod: true,
          akunAp: { select: { id: true, kode: true, nama: true } },
          termPembayaran: { select: { id: true, nama: true, hari: true } },
          lines: {
            orderBy: { no: 'asc' },
            include: {
              item: { select: { kode: true, nama: true } },
              akunDebit: { select: { kode: true, nama: true } },
              project: { select: { id: true, kode: true, nama: true } },
            },
          },
        },
      });
      if (!inv) throw new NotFoundException('Tagihan tidak ditemukan');
      this.cabangScope.assertAccess(inv.cabangId);
      const uids = [
        inv.postedById,
        inv.postedRequestedById,
        inv.cancelledById,
        inv.cancelledRequestedById,
      ].filter((u): u is string => !!u);
      const users = uids.length
        ? await this.prisma.user.findMany({
            where: { id: { in: uids } },
            select: { id: true, email: true, nama: true },
          })
        : [];
      const lookup = (uid: string | null) => users.find((u) => u.id === uid) ?? null;
      return {
        ...inv,
        postedBy: lookup(inv.postedById),
        postedRequestedBy: lookup(inv.postedRequestedById),
        cancelledBy: lookup(inv.cancelledById),
        cancelledRequestedBy: lookup(inv.cancelledRequestedById),
      };
    });
  }

  async createDraft(input: CreatePurchaseInvoiceInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');

    try {
      return await this.tenancy.run(async (tx) => {
        // Idempotency (R3, EVALUASI.md) — lihat catatan analog di
        // SalesService.createDraft.
        if (input.idempotencyKey) {
          const existing = await tx.purchaseInvoice.findFirst({
            where: { tenantId, idempotencyKey: input.idempotencyKey },
            include: { lines: true },
          });
          if (existing) return existing;
        }

        await this.cabangScope.assertOwnedByTenant(tx, input.cabangId);
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

        let jatuhTempoHari = vendor.terminHari;
        if (input.termPembayaranId) {
          const term = await tx.termPembayaran.findFirst({
            where: { id: input.termPembayaranId },
            select: { hari: true },
          });
          if (!term) throw new BadRequestException('Termin pembayaran tidak ditemukan');
          jatuhTempoHari = term.hari;
        }
        const jatuhTempo = input.jatuhTempo
          ? new Date(input.jatuhTempo + 'T00:00:00Z')
          : new Date(tanggal.getTime() + jatuhTempoHari * 86_400_000);

        const calc = this.computeTotals(input.lines, {
          tarifPpn: input.tarifPpnPersen,
          // PPN masukan hanya kalau vendor PKP
          applyPpn: vendor.isPkp,
          potongPph23: input.potongPph23,
          tarifPph23: input.tarifPph23Persen,
          vendorPunyaNpwp: !!vendor.npwp,
          hargaTermasukPajak: input.hargaTermasukPajak,
        });

        const totalNetto = calc.totalDpp.plus(calc.totalPpn).minus(calc.totalPph23);

        return tx.purchaseInvoice.create({
          data: {
            tenantId,
            cabangId: input.cabangId,
            fiscalPeriodId: period.id,
            vendorId: input.vendorId,
            tanggal,
            jatuhTempo,
            termin: input.termin,
            termPembayaranId: input.termPembayaranId ?? null,
            akunApId: input.akunApId,
            nomorVendor: input.nomorVendor,
            nsfpMasukan: input.nsfpMasukan,
            deskripsi: input.deskripsi,
            linkBukti: input.linkBukti ?? null,
            linkBuktiTambahan: input.linkBuktiTambahan ?? [],
            hargaTermasukPajak: input.hargaTermasukPajak,
            status: InvoiceStatus.DRAFT,
            totalDpp: calc.totalDpp.toFixed(2),
            totalPpn: calc.totalPpn.toFixed(2),
            totalPph23: calc.totalPph23.toFixed(2),
            totalDiskon: calc.totalDiskon.toFixed(2),
            totalNetto: totalNetto.toFixed(2),
            createdById: userId,
            idempotencyKey: input.idempotencyKey ?? null,
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
                  projectId: l.projectId ?? null,
                };
              }),
            },
          },
          include: { lines: true },
        });
      });
    } catch (e) {
      // Race: lihat catatan analog di SalesService.createDraft — recovery
      // query WAJIB di transaksi baru, bukan reuse tx yang sudah aborted.
      if (
        input.idempotencyKey &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const winner = await this.tenancy.run((tx) =>
          tx.purchaseInvoice.findFirst({
            where: { tenantId, idempotencyKey: input.idempotencyKey },
            include: { lines: true },
          }),
        );
        if (winner) return winner;
      }
      throw e;
    }
  }

  async updateDraft(id: string, input: CreatePurchaseInvoiceInput) {
    const tenantId = this.ctx.require().tenantId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');
    return this.tenancy.run(async (tx) => {
      const existing = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Tagihan tidak ditemukan');
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
      const vendor = await tx.vendor.findUnique({
        where: { id: input.vendorId },
        select: { isPkp: true, terminHari: true, npwp: true },
      });
      if (!vendor) throw new BadRequestException('Vendor tidak ditemukan');
      let jatuhTempoHari = vendor.terminHari;
      if (input.termPembayaranId) {
        const term = await tx.termPembayaran.findFirst({
          where: { id: input.termPembayaranId },
          select: { hari: true },
        });
        if (!term) throw new BadRequestException('Termin pembayaran tidak ditemukan');
        jatuhTempoHari = term.hari;
      }
      const jatuhTempo = input.jatuhTempo
        ? new Date(input.jatuhTempo + 'T00:00:00Z')
        : new Date(tanggal.getTime() + jatuhTempoHari * 86_400_000);

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
          termPembayaranId: input.termPembayaranId ?? null,
          akunApId: input.akunApId,
          nomorVendor: input.nomorVendor,
          nsfpMasukan: input.nsfpMasukan,
          deskripsi: input.deskripsi,
          linkBukti: input.linkBukti ?? null,
          linkBuktiTambahan: input.linkBuktiTambahan ?? [],
          hargaTermasukPajak: input.hargaTermasukPajak,
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
                projectId: l.projectId ?? null,
              };
            }),
          },
        },
        include: { lines: true },
      });
    });
  }

  async post(
    id: string,
    requestedById?: string | null,
    opts?: { overrideBudget?: boolean; alasan?: string },
  ) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const validRequester = await validateRequestedBy(
        tx, userId, tenantId, requestedById ?? null,
      );
      const inv = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: { lines: true, vendor: { select: { nama: true, isPkp: true } } },
      });
      if (!inv) throw new NotFoundException();
      this.cabangScope.assertAccess(inv.cabangId);
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(`Status ${inv.status}, tidak bisa di-post`);
      }
      await this.approval.assertApprovedForPost(tx, 'PEMBELIAN', id, new Decimal(inv.totalNetto));
      await this.assertPeriodOpen(tx, inv.tanggal);

      // Entri utang saldo awal TIDAK BOLEH di-post lewat endpoint tagihan
      // generik ini — lihat catatan lengkap analog di SalesService.post().
      // Kalau lolos di sini, statusnya jadi POSTED dan hilang dari query
      // DRAFT yang dipakai wizard buat cross-check total Debit=Kredit,
      // sehingga saldo akun kliring bisa nyisa tidak nol permanen.
      if (inv.isSaldoAwal) {
        throw new BadRequestException(
          'Tagihan saldo awal cuma bisa diposting lewat Pengaturan › Saldo Awal ' +
          '(supaya ikut cross-check total Debit=Kredit seluruh run), bukan di sini.',
        );
      }

      const nomor = inv.nomor ?? (await this.seq.next(tx, 'BILL', inv.tanggal));

      // Bangun journal lines:
      // DEBIT:  Persediaan/Beban per line (sebesar DPP), PPN Masukan (kalau ada)
      // KREDIT: Utang Usaha / Kas-Bank (totalNetto), Utang PPh 23 (kalau ada)
      const lines: Array<{
        accountId: string;
        projectId?: string | null;
        debit: string;
        kredit: string;
        deskripsi?: string;
      }> = [];

      // Debit per (akun, project) supaya baris jurnal terpisah per project
      // untuk enforcement budget + laporan per project.
      const debitMap = new Map<
        string,
        { accountId: string; projectId: string | null; nilai: Decimal }
      >();
      for (const l of inv.lines) {
        const k = `${l.akunDebitId}|${l.projectId ?? ''}`;
        const cur = debitMap.get(k);
        debitMap.set(k, {
          accountId: l.akunDebitId,
          projectId: l.projectId,
          nilai: (cur?.nilai ?? new Decimal(0)).plus(new Decimal(l.dpp)),
        });
      }
      for (const { accountId, projectId, nilai } of debitMap.values()) {
        if (nilai.gt(0)) {
          lines.push({
            accountId,
            projectId,
            debit: nilai.toFixed(2),
            kredit: '0',
            deskripsi: 'Tagihan pembelian',
          });
        }
      }

      // PPN Masukan
      const totalPpn = new Decimal(inv.totalPpn);
      if (totalPpn.gt(0)) {
        // Akun PPN Masukan sesuai tarif efektif faktur (11% / 12%).
        const akunPpnMasukanId = await resolvePpnAccountId(
          tx, 'akunPiutangId', inv.totalDpp, totalPpn,
        );
        lines.push({
          accountId: akunPpnMasukanId,
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
        linkBukti: inv.linkBukti ?? null,
        linkBuktiTambahan: inv.linkBuktiTambahan ?? [],
        sumber: JournalSource.PEMBELIAN,
        sumberRef: inv.id,
        lines,
      });
      await this.journals.postInTx(tx, journal.id, null, opts);

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
          postedRequestedById: validRequester,
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
      const inv = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException();
      this.cabangScope.assertAccess(inv.cabangId);
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
          cancelledRequestedById: validRequester,
        },
      });
    });
  }

  async deleteDraft(id: string) {
    return this.tenancy.run(async (tx) => {
      const inv = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException();
      this.cabangScope.assertAccess(inv.cabangId);
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Hanya DRAFT yang bisa dihapus');
      }
      await tx.purchaseInvoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.purchaseInvoice.delete({ where: { id } });
    });
  }

  /**
   * Sama seperti sales, dengan tambahan `hargaTermasukPajak`:
   *   - false (default): harga excl PPN → PPN ditambahkan di atas DPP.
   *   - true: harga incl PPN → DPP di-reverse-calc dari gross.
   *
   * PPh 23 selalu dihitung dari DPP (harga netto), bukan dari gross.
   */
  private computeTotals(
    lines: PurchaseLineInput[],
    opts: {
      tarifPpn: number;
      applyPpn: boolean;
      potongPph23: boolean;
      tarifPph23: number;
      vendorPunyaNpwp: boolean;
      hargaTermasukPajak?: boolean;
    },
  ) {
    const tarifEff = new Decimal(opts.tarifPpn === 11 ? 11 : opts.tarifPpn).div(100);
    const perLine = lines.map((l) => {
      const qty = new Decimal(l.qty);
      const harga = new Decimal(l.hargaSatuan);
      const gross = qty.mul(harga);
      const diskon = gross.mul(new Decimal(l.diskonPersen).div(100)).toDecimalPlaces(2);
      const grossAfterDisc = gross.minus(diskon);

      let dpp: Decimal;
      let ppn: Decimal;
      if (opts.hargaTermasukPajak && opts.applyPpn && isPpnable(l.klasifikasiPpn)) {
        dpp = grossAfterDisc.div(new Decimal(1).plus(tarifEff)).toDecimalPlaces(2);
        ppn = grossAfterDisc.minus(dpp);
      } else {
        dpp = grossAfterDisc;
        ppn = (opts.applyPpn && isPpnable(l.klasifikasiPpn))
          ? dpp.mul(tarifEff).toDecimalPlaces(2)
          : new Decimal(0);
      }

      // PPh 23 — hanya untuk jasa, dan hanya kalau kita memang memotong.
      let pph23 = new Decimal(0);
      if (opts.potongPph23 && l.isJasa) {
        const tarifEfPph23 = opts.vendorPunyaNpwp
          ? new Decimal(opts.tarifPph23)
          : new Decimal(opts.tarifPph23).mul(2); // surcharge 100% tanpa NPWP
        pph23 = dpp.mul(tarifEfPph23).div(100).toDecimalPlaces(0);
      }

      return { bruto: gross, diskonNilai: diskon, dpp, ppn, pph23 };
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
