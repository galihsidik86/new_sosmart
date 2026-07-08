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
import { validateRequestedBy } from '../../common/tenancy/step-up.js';
import { resolvePpnAccountId } from '../../common/gl-config/ppn-account.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';

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
    private readonly glConfig: GlConfigService,
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
              project: { select: { id: true, kode: true, nama: true } },
            },
          },
        },
      });
      if (!inv) throw new NotFoundException('Faktur tidak ditemukan');
      this.cabangScope.assertAccess(inv.cabangId);
      const userIds = [
        inv.postedById,
        inv.postedRequestedById,
        inv.cancelledById,
        inv.cancelledRequestedById,
      ].filter((u): u is string => !!u);
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
        cancelledBy: byId(inv.cancelledById),
        cancelledRequestedBy: byId(inv.cancelledRequestedById),
      };
    });
  }

  // ----------------------------------------------------
  // CREATE DRAFT
  // ----------------------------------------------------

  async createDraft(input: CreateSalesInvoiceInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');

    try {
      return await this.tenancy.run(async (tx) => {
        // Idempotency (R3, EVALUASI.md): client generate key SEKALI per form
        // mount — kalau request ini pengulangan (double-submit/retry jaringan)
        // dari key yang sama, return faktur yang SUDAH dibuat, bukan bikin baru.
        if (input.idempotencyKey) {
          const existing = await tx.salesInvoice.findFirst({
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

        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: { id: true, nama: true, terminHari: true, isPkp: true },
        });
        if (!customer) throw new BadRequestException('Pelanggan tidak ditemukan');

        const jatuhTempo = input.jatuhTempo
          ? new Date(input.jatuhTempo + 'T00:00:00Z')
          : new Date(tanggal.getTime() + customer.terminHari * 86_400_000);

        // PMK 131/2024: Faktur pajak (dan PPN keluaran) hanya diterbitkan
        // untuk customer PKP. Untuk non-PKP: klasifikasi kena PPN (BKP/JKP)
        // di-coerce ke NON_BKP supaya PPN tidak dihitung.
        const lines = customer.isPkp
          ? input.lines
          : input.lines.map((l) =>
              isPpnable(l.klasifikasiPpn)
                ? { ...l, klasifikasiPpn: KlasifikasiPpn.NON_BKP }
                : l,
            );
        const calc = this.computeTotals(lines, input.tarifPpnPersen, input.hargaTermasukPajak);

        return tx.salesInvoice.create({
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
            linkBukti: input.linkBukti ?? null,
            hargaTermasukPajak: input.hargaTermasukPajak,
            kodeFakturPajak: input.kodeFakturPajak,
            nsfp: input.nsfp,
            status: InvoiceStatus.DRAFT,
            totalDpp: calc.totalDpp.toFixed(2),
            totalPpn: calc.totalPpn.toFixed(2),
            totalPph23: '0',                    // PPh 23 dipotong customer, bukan kita
            totalDiskon: calc.totalDiskon.toFixed(2),
            totalNetto: calc.totalDpp.plus(calc.totalPpn).toFixed(2),
            createdById: userId,
            idempotencyKey: input.idempotencyKey ?? null,
            lines: {
              create: lines.map((l, i) => {
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
                  projectId: l.projectId ?? null,
                };
              }),
            },
          },
          include: { lines: true },
        });
      });
    } catch (e) {
      // Race: 2 request ber-idempotencyKey sama lolos findFirst check di
      // dalam transaksi bersamaan (belum ada yang commit) — unique
      // constraint DB jadi backstop terakhir. Recovery query WAJIB di
      // transaksi BARU (bukan reuse tx di atas), karena Postgres menolak
      // query lanjutan di transaksi yang sudah aborted akibat P2002.
      if (
        input.idempotencyKey &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const winner = await this.tenancy.run((tx) =>
          tx.salesInvoice.findFirst({
            where: { tenantId, idempotencyKey: input.idempotencyKey },
            include: { lines: true },
          }),
        );
        if (winner) return winner;
      }
      throw e;
    }
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
      // RLS cuma menjamin isolasi tenant — cabang belum dicek di jalur mutasi
      // ini. Tanpa ini, user dengan MembershipCabang terbatas ke cabang A bisa
      // edit faktur cabang B (sama tenant) kalau tahu/menebak id-nya.
      this.cabangScope.assertAccess(existing.cabangId);
      // existing.cabangId sudah aman (RLS-scoped findUnique di atas). Target
      // input.cabangId (baru) belum tentu — cabangId tenant lain bisa lolos
      // FK constraint (tidak kena RLS di UPDATE) kalau cuma assertAccess biasa.
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
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { terminHari: true, isPkp: true },
      });
      if (!customer) throw new BadRequestException('Pelanggan tidak ditemukan');
      const jatuhTempo = input.jatuhTempo
        ? new Date(input.jatuhTempo + 'T00:00:00Z')
        : new Date(tanggal.getTime() + customer.terminHari * 86_400_000);

      // PMK 131/2024: non-PKP → coerce BKP/JKP ke NON_BKP (tidak terbit FP).
      const lines = customer.isPkp
        ? input.lines
        : input.lines.map((l) =>
            isPpnable(l.klasifikasiPpn)
              ? { ...l, klasifikasiPpn: KlasifikasiPpn.NON_BKP }
              : l,
          );
      const calc = this.computeTotals(lines, input.tarifPpnPersen, input.hargaTermasukPajak);

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
          linkBukti: input.linkBukti ?? null,
          hargaTermasukPajak: input.hargaTermasukPajak,
          kodeFakturPajak: input.kodeFakturPajak,
          nsfp: input.nsfp,
          totalDpp: calc.totalDpp.toFixed(2),
          totalPpn: calc.totalPpn.toFixed(2),
          totalPph23: '0',
          totalDiskon: calc.totalDiskon.toFixed(2),
          totalNetto: calc.totalDpp.plus(calc.totalPpn).toFixed(2),
          lines: {
            create: lines.map((l, i) => {
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
                projectId: l.projectId ?? null,
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
      const inv = await tx.salesInvoice.findUnique({
        where: { id },
        include: {
          lines: true,
          customer: { select: { nama: true, akunPiutangId: true } },
          akunAr: { select: { kode: true } },
        },
      });
      if (!inv) throw new NotFoundException('Faktur tidak ditemukan');
      this.cabangScope.assertAccess(inv.cabangId);
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(`Faktur status ${inv.status}, tidak bisa di-post`);
      }
      await this.assertPeriodOpen(tx, inv.tanggal);

      // Entri piutang saldo awal (prosedur Saldo Awal Terintegrasi) TIDAK
      // BOLEH di-post lewat endpoint faktur generik ini. OpeningBalanceService.
      // post() nge-post SEMUA baris piutang/utang/persediaan/akun manual dalam
      // SATU transaksi setelah cross-check total Debit=Kredit — kalau baris
      // ini di-post duluan lewat sini, dia langsung lolos ke status POSTED dan
      // "hilang" dari query DRAFT yang dipakai wizard buat hitung selisih
      // (opening-balance.service.ts buildPreviewInTx), sehingga wizard bisa
      // menyatakan "balanced" padahal saldo akun kliring (3-105) nyisa tidak
      // nol secara permanen — jurnal sudah terlanjur POSTED, tidak ada validasi
      // lanjutan yang menangkapnya. Wajib lewat Pengaturan › Saldo Awal.
      if (inv.isSaldoAwal) {
        throw new BadRequestException(
          'Faktur saldo awal cuma bisa diposting lewat Pengaturan › Saldo Awal ' +
          '(supaya ikut cross-check total Debit=Kredit seluruh run), bukan di sini.',
        );
      }

      // Alokasi nomor INV
      const nomor = inv.nomor ?? (await this.seq.next(tx, 'INV', inv.tanggal));

      // ---- Bangun journal lines ----
      // Sisi DEBIT: akun AR (piutang atau kas/bank) sebesar totalNetto
      // Sisi KREDIT: pendapatan per akun (group), PPN keluaran (utang PPN)
      const totalNetto = new Decimal(inv.totalNetto);

      const lines: Array<{
        accountId: string;
        projectId?: string | null;
        debit: string;
        kredit: string;
        deskripsi?: string;
      }> = [];
      lines.push({
        accountId: inv.akunArId,
        debit: totalNetto.toFixed(2),
        kredit: '0',
        deskripsi: `Faktur ${nomor} — ${inv.customer.nama}`,
      });

      // Group pendapatan per (akun, project) supaya baris jurnal terpisah
      // per project untuk enforcement budget + laporan per project.
      const pendapatanKey = (accountId: string, projectId: string | null) =>
        `${accountId}|${projectId ?? ''}`;
      const pendapatanMap = new Map<
        string,
        { accountId: string; projectId: string | null; nilai: Decimal }
      >();
      for (const l of inv.lines) {
        const k = pendapatanKey(l.akunPendapatanId, l.projectId);
        const cur = pendapatanMap.get(k);
        // Pendapatan diakui sebesar DPP (diskon mengurangi pendapatan).
        pendapatanMap.set(k, {
          accountId: l.akunPendapatanId,
          projectId: l.projectId,
          nilai: (cur?.nilai ?? new Decimal(0)).plus(new Decimal(l.dpp)),
        });
      }
      for (const { accountId, projectId, nilai } of pendapatanMap.values()) {
        if (nilai.gt(0)) {
          lines.push({
            accountId,
            projectId,
            debit: '0',
            kredit: nilai.toFixed(2),
            deskripsi: 'Pendapatan dari faktur',
          });
        }
      }

      // PPN keluaran (kalau ada)
      const totalPpn = new Decimal(inv.totalPpn);
      if (totalPpn.gt(0)) {
        // Pilih akun Utang PPN sesuai tarif efektif faktur — faktur 12%
        // (BKP mewah) tidak lagi tersalah-posting ke akun tarif 11%.
        const akunUtangPpnId = await resolvePpnAccountId(
          tx, 'akunUtangId', inv.totalDpp, totalPpn,
        );
        lines.push({
          accountId: akunUtangPpnId,
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
      await this.journals.postInTx(tx, journal.id, null, opts);

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
        // Group per (akun, project) supaya HPP jurnal juga terpisah per project.
        const hppMap = new Map<
          string,
          { accountId: string; projectId: string | null; nilai: Decimal }
        >();
        const persediaanMap = new Map<
          string,
          { accountId: string; projectId: string | null; nilai: Decimal }
        >();
        const k = (aid: string, pid: string | null) => `${aid}|${pid ?? ''}`;
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
          const kH = k(l.item.akunHppId, l.projectId);
          const kP = k(l.item.akunPersediaanId, l.projectId);
          const curH = hppMap.get(kH);
          hppMap.set(kH, {
            accountId: l.item.akunHppId,
            projectId: l.projectId,
            nilai: (curH?.nilai ?? new Decimal(0)).plus(res.hpp),
          });
          const curP = persediaanMap.get(kP);
          persediaanMap.set(kP, {
            accountId: l.item.akunPersediaanId,
            projectId: l.projectId,
            nilai: (curP?.nilai ?? new Decimal(0)).plus(res.hpp),
          });
        }
        // Jurnal HPP terpisah: D HPP, K Persediaan.
        const hppLines: Array<{
          accountId: string;
          projectId?: string | null;
          debit: string;
          kredit: string;
          deskripsi?: string;
        }> = [];
        for (const v of hppMap.values()) {
          if (v.nilai.gt(0)) hppLines.push({
            accountId: v.accountId,
            projectId: v.projectId,
            debit: v.nilai.toFixed(2),
            kredit: '0',
            deskripsi: 'HPP penjualan',
          });
        }
        for (const v of persediaanMap.values()) {
          if (v.nilai.gt(0)) hppLines.push({
            accountId: v.accountId,
            projectId: v.projectId,
            debit: '0',
            kredit: v.nilai.toFixed(2),
            deskripsi: 'Kurangi persediaan',
          });
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
          await this.journals.postInTx(tx, hppJournal.id, null, opts);
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
          postedRequestedById: validRequester,
        },
      });
    });
  }

  // ----------------------------------------------------
  // CANCEL: kalau POSTED → reverse jurnal; status → CANCELLED
  // ----------------------------------------------------

  async cancel(id: string, alasan: string, requestedById?: string | null) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const validRequester = await validateRequestedBy(
        tx, userId, tenantId, requestedById ?? null,
      );
      const inv = await tx.salesInvoice.findUnique({
        where: { id },
        include: { customer: { select: { nama: true } } },
      });
      if (!inv) throw new NotFoundException('Faktur tidak ditemukan');
      this.cabangScope.assertAccess(inv.cabangId);
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
          cancelledRequestedById: validRequester,
        },
      });
    });
  }

  async deleteDraft(id: string) {
    return this.tenancy.run(async (tx) => {
      const inv = await tx.salesInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException();
      this.cabangScope.assertAccess(inv.cabangId);
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

  /**
   * Hitung DPP + PPN per line.
   *
   * Mode "harga excl PPN" (default, `hargaTermasukPajak=false`):
   *   bruto = qty × harga
   *   dpp   = bruto − diskon
   *   ppn   = dpp × tarifEfektif%
   *   grand = dpp + ppn
   *
   * Mode "harga incl PPN" (`hargaTermasukPajak=true`, harga tag POS style):
   *   gross = qty × harga (SUDAH termasuk PPN)
   *   grossAfterDisc = gross − diskon
   *   dpp   = grossAfterDisc / (1 + tarifEfektif/100)
   *   ppn   = grossAfterDisc − dpp
   */
  private computeTotals(
    lines: SalesLineInput[],
    tarifPpn: number,
    hargaTermasukPajak = false,
  ) {
    // Tarif efektif PPN: kalau tarif=11 pakai 11% (PMK 131/2024 efektif),
    // kalau 12 pakai 12% penuh (BKP mewah).
    const tarifEff = new Decimal(tarifPpn === 11 ? 11 : tarifPpn).div(100);
    const perLine = lines.map((l) => {
      const qty = new Decimal(l.qty);
      const harga = new Decimal(l.hargaSatuan);
      const gross = qty.mul(harga);
      const diskon = gross.mul(new Decimal(l.diskonPersen).div(100)).toDecimalPlaces(2);
      const grossAfterDisc = gross.minus(diskon);

      let dpp: Decimal;
      let ppn: Decimal;
      if (hargaTermasukPajak && isPpnable(l.klasifikasiPpn)) {
        // Reverse-calc: gross = DPP × (1 + tarifEff)
        dpp = grossAfterDisc.div(new Decimal(1).plus(tarifEff)).toDecimalPlaces(2);
        ppn = grossAfterDisc.minus(dpp);
      } else {
        dpp = grossAfterDisc;
        ppn = isPpnable(l.klasifikasiPpn)
          ? dpp.mul(tarifEff).toDecimalPlaces(2)
          : new Decimal(0);
      }
      // Bruto untuk snapshot line = harga × qty (tanpa reverse-calc).
      return { bruto: gross, diskonNilai: diskon, dpp, ppn };
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
