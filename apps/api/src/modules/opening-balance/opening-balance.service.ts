import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  AccountKind,
  InvoiceStatus,
  JournalSource,
  JournalStatus,
  NormalBalance,
  StokMovementType,
  TerminPembayaran,
} from '@lentera/db';
import type {
  SaldoAwalPersediaanLineInput,
  SaldoAwalPiutangInput,
  SaldoAwalUtangInput,
  SetSaldoAwalAkunInput,
} from '@lentera/shared/schemas';
import { GlConfigKey } from '@lentera/shared/enums';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { validateRequestedBy } from '../../common/tenancy/step-up.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PeriodsService } from '../periods/periods.service.js';
import type { Prisma } from '@lentera/db';

const SUBSIDIARY_KEYS: GlConfigKey[] = ['PIUTANG_USAHA', 'UTANG_USAHA', 'PERSEDIAAN'];
const SUBSIDIARY_LABEL: Record<string, string> = {
  PIUTANG_USAHA: 'Piutang (tab Piutang)',
  UTANG_USAHA: 'Utang (tab Utang)',
  PERSEDIAAN: 'Persediaan (tab Persediaan)',
};

/**
 * Prosedur Saldo Awal Terintegrasi — satu "run" per tenant yang
 * mengorkestrasi saldo awal akun manual (Kas/Aset Tetap/Modal/dst) + piutang
 * per customer + utang per vendor + persediaan per item SEKALIGUS, dengan
 * cross-check otomatis (total Debit harus = total Kredit) sebelum posting.
 *
 * Semua entri saldo awal lawan-transaksinya adalah SATU akun kliring
 * (GlConfigKey.SALDO_AWAL_KLIRING, default kode 3-105, auto-provisioned) —
 * setelah posting sukses, saldo akun ini otomatis nol (bukti matematis
 * bahwa input sudah balance), bisa dicek langsung di Neraca Saldo.
 *
 * Piutang/utang diwakili SalesInvoice/PurchaseInvoice biasa dengan
 * isSaldoAwal=true (lihat SalesService.post()/PurchasesService.post()) —
 * supaya otomatis muncul di aging & statement tanpa kode baru di sana.
 */
@Injectable()
export class OpeningBalanceService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly glConfig: GlConfigService,
    private readonly seq: SequenceService,
    private readonly journals: JournalsService,
    private readonly inventory: InventoryService,
    private readonly periods: PeriodsService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  // ----------------------------------------------------
  // Run lifecycle
  // ----------------------------------------------------

  private async getOrCreateRunInTx(tx: Prisma.TransactionClient) {
    const tenantId = this.ctx.require().tenantId;
    const existing = await tx.saldoAwal.findUnique({ where: { tenantId } });
    if (existing) return existing;

    const fy = await tx.fiscalYear.findFirst({ orderBy: { startDate: 'asc' } });
    if (!fy) {
      throw new BadRequestException('Buat tahun buku (fiscal year) dulu sebelum input saldo awal');
    }
    const cabang =
      (await tx.cabang.findFirst({ where: { isPusat: true } })) ??
      (await tx.cabang.findFirst());
    if (!cabang) {
      throw new BadRequestException('Buat cabang dulu sebelum input saldo awal');
    }
    const userId = this.ctx.require().userId;
    return tx.saldoAwal.create({
      data: { tenantId, cabangId: cabang.id, tanggal: fy.startDate, createdById: userId },
    });
  }

  async getRun() {
    return this.tenancy.run((tx) => this.getOrCreateRunInTx(tx));
  }

  private assertDraft(run: { status: InvoiceStatus }) {
    if (run.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        run.status === InvoiceStatus.POSTED
          ? 'Saldo awal sudah diposting — void dulu di Pengaturan › Saldo Awal untuk koreksi'
          : 'Saldo awal sudah dibatalkan',
      );
    }
  }

  /** Resolve accountId untuk PIUTANG_USAHA/UTANG_USAHA/PERSEDIAAN — skip diam-diam kalau belum ada akun default-nya. */
  private async resolveSubsidiaryAccountIds(tx: Prisma.TransactionClient): Promise<Map<string, GlConfigKey>> {
    const map = new Map<string, GlConfigKey>();
    for (const key of SUBSIDIARY_KEYS) {
      try {
        const id = await this.glConfig.getAccountIdInTx(tx, key);
        map.set(id, key);
      } catch {
        // akun default belum ada di tenant ini — tidak relevan, lewati.
      }
    }
    return map;
  }

  /** Auto-provision akun kliring (3-105) kalau belum ada di COA tenant. */
  private async ensureKliringAccountInTx(tx: Prisma.TransactionClient): Promise<string> {
    try {
      return await this.glConfig.getAccountIdInTx(tx, 'SALDO_AWAL_KLIRING');
    } catch {
      const tenantId = this.ctx.require().tenantId;
      const acc = await tx.account.create({
        data: {
          tenantId,
          kode: '3-105',
          nama: 'Saldo Awal — Ekuitas Kliring',
          kind: AccountKind.EKUITAS,
          normalBalance: NormalBalance.KREDIT,
          isPostable: true,
        },
      });
      await tx.glConfig.upsert({
        where: { tenantId_key: { tenantId, key: 'SALDO_AWAL_KLIRING' } },
        create: { tenantId, key: 'SALDO_AWAL_KLIRING', accountId: acc.id },
        update: { accountId: acc.id },
      });
      return acc.id;
    }
  }

  // ----------------------------------------------------
  // Akun manual (staging = Account.saldoAwal, seperti sebelumnya)
  // ----------------------------------------------------

  async listAkun() {
    return this.tenancy.run(async (tx) => {
      const subsidiary = await this.resolveSubsidiaryAccountIds(tx);
      const accounts = await tx.account.findMany({
        where: { isActive: true, isPostable: true },
        orderBy: { kode: 'asc' },
      });
      return accounts
        .filter((a) => !subsidiary.has(a.id))
        .map((a) => ({
          id: a.id, kode: a.kode, nama: a.nama,
          normalBalance: a.normalBalance, saldoAwal: a.saldoAwal.toString(),
        }));
    });
  }

  async setAkunLines(input: SetSaldoAwalAkunInput) {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      this.assertDraft(run);
      const subsidiary = await this.resolveSubsidiaryAccountIds(tx);
      for (const l of input.lines) {
        const key = subsidiary.get(l.accountId);
        if (key) {
          throw new BadRequestException(
            `Akun ini dikelola lewat ${SUBSIDIARY_LABEL[key]}, bukan di sini.`,
          );
        }
        const acc = await tx.account.findUnique({ where: { id: l.accountId } });
        if (!acc) throw new BadRequestException('Akun tidak ditemukan');
        await tx.account.update({ where: { id: l.accountId }, data: { saldoAwal: l.nilai } });
      }
      return { ok: true };
    });
  }

  // ----------------------------------------------------
  // Piutang (per customer) — SalesInvoice isSaldoAwal=true
  // ----------------------------------------------------

  async listPiutang() {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      return tx.salesInvoice.findMany({
        where: { saldoAwalId: run.id },
        include: { customer: { select: { nama: true, kode: true } } },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async addPiutang(input: SaldoAwalPiutangInput) {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      this.assertDraft(run);
      this.cabangScope.assertAccess(input.cabangId);
      const tenantId = this.ctx.require().tenantId;
      const userId = this.ctx.require().userId;
      const tanggal = new Date(input.tanggal + 'T00:00:00Z');
      const jatuhTempo = input.jatuhTempo ? new Date(input.jatuhTempo + 'T00:00:00Z') : tanggal;

      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { akunPiutangId: true },
      });
      if (!customer) throw new BadRequestException('Pelanggan tidak ditemukan');
      const akunArId = customer.akunPiutangId ?? (await this.glConfig.getAccountIdInTx(tx, 'PIUTANG_USAHA'));

      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');

      const nominal = new Decimal(input.nominal);
      return tx.salesInvoice.create({
        data: {
          tenantId, cabangId: input.cabangId, fiscalPeriodId: period.id,
          customerId: input.customerId, tanggal, jatuhTempo,
          termin: TerminPembayaran.KREDIT, akunArId,
          status: InvoiceStatus.DRAFT,
          deskripsi: input.keterangan ?? 'Saldo awal piutang',
          totalDpp: '0', totalPpn: '0', totalPph23: '0', totalDiskon: '0',
          totalNetto: nominal.toFixed(2),
          isSaldoAwal: true, saldoAwalId: run.id,
          createdById: userId,
        },
      });
    });
  }

  async removePiutang(id: string) {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      this.assertDraft(run);
      const inv = await tx.salesInvoice.findUnique({ where: { id } });
      if (!inv || inv.saldoAwalId !== run.id) throw new NotFoundException();
      await tx.salesInvoice.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ----------------------------------------------------
  // Utang (per vendor) — PurchaseInvoice isSaldoAwal=true
  // ----------------------------------------------------

  async listUtang() {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      return tx.purchaseInvoice.findMany({
        where: { saldoAwalId: run.id },
        include: { vendor: { select: { nama: true, kode: true } } },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async addUtang(input: SaldoAwalUtangInput) {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      this.assertDraft(run);
      this.cabangScope.assertAccess(input.cabangId);
      const tenantId = this.ctx.require().tenantId;
      const userId = this.ctx.require().userId;
      const tanggal = new Date(input.tanggal + 'T00:00:00Z');
      const jatuhTempo = input.jatuhTempo ? new Date(input.jatuhTempo + 'T00:00:00Z') : tanggal;

      const vendor = await tx.vendor.findUnique({
        where: { id: input.vendorId },
        select: { akunUtangId: true },
      });
      if (!vendor) throw new BadRequestException('Vendor tidak ditemukan');
      const akunApId = vendor.akunUtangId ?? (await this.glConfig.getAccountIdInTx(tx, 'UTANG_USAHA'));

      const period = await tx.fiscalPeriod.findFirst({
        where: { startDate: { lte: tanggal }, endDate: { gte: tanggal } },
      });
      if (!period) throw new BadRequestException('Tanggal di luar tahun buku');

      const nominal = new Decimal(input.nominal);
      return tx.purchaseInvoice.create({
        data: {
          tenantId, cabangId: input.cabangId, fiscalPeriodId: period.id,
          vendorId: input.vendorId, tanggal, jatuhTempo,
          termin: TerminPembayaran.KREDIT, akunApId,
          status: InvoiceStatus.DRAFT,
          deskripsi: input.keterangan ?? 'Saldo awal utang',
          totalDpp: '0', totalPpn: '0', totalPph23: '0', totalDiskon: '0',
          totalNetto: nominal.toFixed(2),
          isSaldoAwal: true, saldoAwalId: run.id,
          createdById: userId,
        },
      });
    });
  }

  async removeUtang(id: string) {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      this.assertDraft(run);
      const inv = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!inv || inv.saldoAwalId !== run.id) throw new NotFoundException();
      await tx.purchaseInvoice.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ----------------------------------------------------
  // Persediaan — ItemStokAwal (bulk upsert)
  // ----------------------------------------------------

  async listPersediaan() {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      return tx.itemStokAwal.findMany({
        where: { tanggal: run.tanggal, saldoAwalId: null },
        include: {
          item: { select: { kode: true, nama: true, akunPersediaanId: true } },
          cabang: { select: { kode: true, nama: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async setPersediaan(input: { lines: SaldoAwalPersediaanLineInput[] }) {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      this.assertDraft(run);
      const tenantId = this.ctx.require().tenantId;
      for (const l of input.lines) {
        this.cabangScope.assertAccess(l.cabangId);
        const tanggal = new Date(l.tanggal + 'T00:00:00Z');
        await tx.itemStokAwal.upsert({
          where: { itemId_cabangId_tanggal: { itemId: l.itemId, cabangId: l.cabangId, tanggal } },
          create: {
            tenantId, itemId: l.itemId, cabangId: l.cabangId, tanggal,
            qty: l.qty, hargaPokokPerUnit: l.hargaPokokPerUnit,
          },
          update: { qty: l.qty, hargaPokokPerUnit: l.hargaPokokPerUnit },
        });
      }
      return { ok: true };
    });
  }

  async removePersediaan(itemStokAwalId: string) {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      this.assertDraft(run);
      const row = await tx.itemStokAwal.findUnique({ where: { id: itemStokAwalId } });
      if (!row || row.saldoAwalId) throw new NotFoundException();
      await tx.itemStokAwal.delete({ where: { id: itemStokAwalId } });
      return { ok: true };
    });
  }

  // ----------------------------------------------------
  // Precheck (cross-check otomatis) & posting
  // ----------------------------------------------------

  private async buildPreviewInTx(tx: Prisma.TransactionClient, run: { id: string; tanggal: Date }) {
    const subsidiary = await this.resolveSubsidiaryAccountIds(tx);
    const accounts = await tx.account.findMany({
      where: { isActive: true, isPostable: true, saldoAwal: { not: 0 } },
    });

    let totalDebit = new Decimal(0);
    let totalKredit = new Decimal(0);
    const akunLines: Array<{ accountId: string; kode: string; nama: string; nilai: string; sisi: 'DEBIT' | 'KREDIT' }> = [];
    for (const acc of accounts) {
      if (subsidiary.has(acc.id)) continue; // dikelola via tab Piutang/Utang/Persediaan
      const nilai = new Decimal(acc.saldoAwal);
      if (nilai.eq(0)) continue;
      const sisi = acc.normalBalance === NormalBalance.DEBIT ? 'DEBIT' : 'KREDIT';
      if (sisi === 'DEBIT') totalDebit = totalDebit.plus(nilai);
      else totalKredit = totalKredit.plus(nilai);
      akunLines.push({ accountId: acc.id, kode: acc.kode, nama: acc.nama, nilai: nilai.toFixed(2), sisi });
    }

    const piutang = await tx.salesInvoice.findMany({
      where: { saldoAwalId: run.id, status: InvoiceStatus.DRAFT },
    });
    const totalPiutang = piutang.reduce((a, i) => a.plus(new Decimal(i.totalNetto)), new Decimal(0));
    totalDebit = totalDebit.plus(totalPiutang);

    const utang = await tx.purchaseInvoice.findMany({
      where: { saldoAwalId: run.id, status: InvoiceStatus.DRAFT },
    });
    const totalUtang = utang.reduce((a, i) => a.plus(new Decimal(i.totalNetto)), new Decimal(0));
    totalKredit = totalKredit.plus(totalUtang);

    const persediaan = await tx.itemStokAwal.findMany({
      where: { tanggal: run.tanggal, saldoAwalId: null },
    });
    const totalPersediaan = persediaan.reduce(
      (a, p) => a.plus(new Decimal(p.qty).mul(p.hargaPokokPerUnit)), new Decimal(0),
    );
    totalDebit = totalDebit.plus(totalPersediaan);

    const selisih = totalDebit.minus(totalKredit);
    return {
      totalDebit, totalKredit, selisih, balanced: selisih.eq(0),
      akunLines, totalPiutang, totalUtang, totalPersediaan,
      countPiutang: piutang.length, countUtang: utang.length, countPersediaan: persediaan.length,
    };
  }

  async preview() {
    return this.tenancy.run(async (tx) => {
      const run = await this.getOrCreateRunInTx(tx);
      const p = await this.buildPreviewInTx(tx, run);
      return {
        runId: run.id, status: run.status, tanggal: run.tanggal,
        totalDebit: p.totalDebit.toFixed(2), totalKredit: p.totalKredit.toFixed(2),
        selisih: p.selisih.toFixed(2), balanced: p.balanced,
        totalPiutang: p.totalPiutang.toFixed(2), totalUtang: p.totalUtang.toFixed(2),
        totalPersediaan: p.totalPersediaan.toFixed(2),
        countPiutang: p.countPiutang, countUtang: p.countUtang, countPersediaan: p.countPersediaan,
      };
    });
  }

  async post(requestedById?: string | null) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const validRequester = await validateRequestedBy(tx, userId, tenantId, requestedById ?? null);
      const run = await this.getOrCreateRunInTx(tx);
      this.assertDraft(run);
      await this.periods.assertOpen(tx, run.tanggal);

      const preview = await this.buildPreviewInTx(tx, run);
      if (!preview.balanced) {
        throw new BadRequestException(
          `Saldo awal belum seimbang — selisih Rp ${preview.selisih.toFixed(2)} ` +
          `(Debit ${preview.totalDebit.toFixed(2)}, Kredit ${preview.totalKredit.toFixed(2)})`,
        );
      }

      const akunKliringId = await this.ensureKliringAccountInTx(tx);

      // Snapshot SEMUA saldoAwal akun non-nol (termasuk subsidiary) sebelum
      // di-reset — audit trail + sumber restore kalau run di-void.
      const allNonZero = await tx.account.findMany({ where: { tenantId, saldoAwal: { not: 0 } } });
      for (const acc of allNonZero) {
        await tx.saldoAwalAkunLine.create({
          data: { tenantId, saldoAwalId: run.id, accountId: acc.id, nilai: acc.saldoAwal },
        });
      }

      // 1. Jurnal akun manual (kalau ada) vs kliring.
      if (preview.akunLines.length > 0) {
        const jLines: Array<{ accountId: string; debit: string; kredit: string }> = preview.akunLines.map((l) => ({
          accountId: l.accountId,
          debit: l.sisi === 'DEBIT' ? l.nilai : '0',
          kredit: l.sisi === 'KREDIT' ? l.nilai : '0',
        }));
        const manualDebitSum = preview.akunLines
          .filter((l) => l.sisi === 'DEBIT')
          .reduce((a, l) => a.plus(l.nilai), new Decimal(0));
        const manualKreditSum = preview.akunLines
          .filter((l) => l.sisi === 'KREDIT')
          .reduce((a, l) => a.plus(l.nilai), new Decimal(0));
        const diff = manualDebitSum.minus(manualKreditSum);
        if (diff.gt(0)) jLines.push({ accountId: akunKliringId, debit: '0', kredit: diff.toFixed(2) });
        else if (diff.lt(0)) jLines.push({ accountId: akunKliringId, debit: diff.abs().toFixed(2), kredit: '0' });

        const manualJournal = await this.journals.createDraftInTx(tx, {
          cabangId: run.cabangId,
          tanggal: run.tanggal.toISOString().slice(0, 10),
          deskripsi: 'Saldo awal akun',
          sumber: JournalSource.SALDO_AWAL,
          sumberRef: run.id,
          lines: jLines,
        });
        await this.journals.postInTx(tx, manualJournal.id);
      }

      // Reset SEMUA Account.saldoAwal ke 0 — nilainya sekarang hidup di GL
      // (mencegah double-count di laporan, lihat reports/helpers.ts).
      await tx.account.updateMany({ where: { tenantId }, data: { saldoAwal: 0 } });

      // 2. Persediaan — StokMovement STOK_AWAL + jurnal per cabang.
      const persediaanRows = await tx.itemStokAwal.findMany({
        where: { tanggal: run.tanggal, saldoAwalId: null },
        include: { item: { select: { akunPersediaanId: true, kode: true } } },
      });
      const byCabang = new Map<string, typeof persediaanRows>();
      for (const r of persediaanRows) {
        const arr = byCabang.get(r.cabangId) ?? [];
        arr.push(r);
        byCabang.set(r.cabangId, arr);
      }
      for (const [cabangId, rows] of byCabang) {
        const persediaanDebit = new Map<string, Decimal>();
        let total = new Decimal(0);
        for (const isa of rows) {
          if (!isa.item.akunPersediaanId) {
            throw new BadRequestException(`Item ${isa.item.kode} tidak punya akun persediaan`);
          }
          // Idempotent: skip kalau movement sudah pernah dibuat untuk baris ini.
          const already = await tx.stokMovement.findFirst({
            where: { sumberType: 'STOK_AWAL', sumberId: isa.id },
          });
          if (!already) {
            await this.inventory.recordInbound(tx, {
              itemId: isa.itemId, cabangId, tanggal: isa.tanggal,
              qty: new Decimal(isa.qty), hargaPokok: new Decimal(isa.hargaPokokPerUnit),
              tipe: StokMovementType.STOK_AWAL,
              sumberType: 'STOK_AWAL', sumberId: isa.id,
              keterangan: 'Saldo awal terintegrasi',
            });
          }
          const nilai = new Decimal(isa.qty).mul(isa.hargaPokokPerUnit).toDecimalPlaces(2);
          persediaanDebit.set(
            isa.item.akunPersediaanId,
            (persediaanDebit.get(isa.item.akunPersediaanId) ?? new Decimal(0)).plus(nilai),
          );
          total = total.plus(nilai);
          await tx.itemStokAwal.update({ where: { id: isa.id }, data: { saldoAwalId: run.id } });
        }
        if (total.gt(0)) {
          const jLines = [...persediaanDebit].map(([accountId, n]) => ({
            accountId, debit: n.toFixed(2), kredit: '0',
          }));
          jLines.push({ accountId: akunKliringId, debit: '0', kredit: total.toFixed(2) });
          const journal = await this.journals.createDraftInTx(tx, {
            cabangId, tanggal: run.tanggal.toISOString().slice(0, 10),
            deskripsi: 'Saldo awal persediaan',
            sumber: JournalSource.SALDO_AWAL, sumberRef: run.id, lines: jLines,
          });
          await this.journals.postInTx(tx, journal.id);
        }
      }

      // 3. Piutang — 1 jurnal per invoice: D AR / K Kliring.
      const piutangDrafts = await tx.salesInvoice.findMany({
        where: { saldoAwalId: run.id, status: InvoiceStatus.DRAFT },
        include: { customer: { select: { nama: true } } },
      });
      for (const inv of piutangDrafts) {
        const nomor = inv.nomor ?? (await this.seq.next(tx, 'INV', inv.tanggal));
        const totalNetto = new Decimal(inv.totalNetto);
        const journal = await this.journals.createDraftInTx(tx, {
          cabangId: inv.cabangId,
          tanggal: inv.tanggal.toISOString().slice(0, 10),
          deskripsi: `Saldo awal piutang ${nomor} — ${inv.customer.nama}`,
          sumber: JournalSource.SALDO_AWAL, sumberRef: run.id,
          lines: [
            { accountId: inv.akunArId, debit: totalNetto.toFixed(2), kredit: '0' },
            { accountId: akunKliringId, debit: '0', kredit: totalNetto.toFixed(2) },
          ],
        });
        await this.journals.postInTx(tx, journal.id);
        await tx.salesInvoice.update({
          where: { id: inv.id },
          data: {
            status: InvoiceStatus.POSTED, nomor, journalId: journal.id,
            postedAt: new Date(), postedById: userId, postedRequestedById: validRequester,
          },
        });
      }

      // 4. Utang — 1 jurnal per invoice: D Kliring / K AP.
      const utangDrafts = await tx.purchaseInvoice.findMany({
        where: { saldoAwalId: run.id, status: InvoiceStatus.DRAFT },
        include: { vendor: { select: { nama: true } } },
      });
      for (const inv of utangDrafts) {
        const nomor = inv.nomor ?? (await this.seq.next(tx, 'BILL', inv.tanggal));
        const totalNetto = new Decimal(inv.totalNetto);
        const journal = await this.journals.createDraftInTx(tx, {
          cabangId: inv.cabangId,
          tanggal: inv.tanggal.toISOString().slice(0, 10),
          deskripsi: `Saldo awal utang ${nomor} — ${inv.vendor.nama}`,
          sumber: JournalSource.SALDO_AWAL, sumberRef: run.id,
          lines: [
            { accountId: akunKliringId, debit: totalNetto.toFixed(2), kredit: '0' },
            { accountId: inv.akunApId, debit: '0', kredit: totalNetto.toFixed(2) },
          ],
        });
        await this.journals.postInTx(tx, journal.id);
        await tx.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            status: InvoiceStatus.POSTED, nomor, journalId: journal.id,
            postedAt: new Date(), postedById: userId, postedRequestedById: validRequester,
          },
        });
      }

      return tx.saldoAwal.update({
        where: { id: run.id },
        data: {
          status: InvoiceStatus.POSTED,
          totalDebit: preview.totalDebit.toFixed(2),
          totalKredit: preview.totalKredit.toFixed(2),
          postedAt: new Date(), postedById: userId, postedRequestedById: validRequester,
        },
      });
    });
  }

  async void(alasan: string, requestedById?: string | null) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const validRequester = await validateRequestedBy(tx, userId, tenantId, requestedById ?? null);
      const run = await this.getOrCreateRunInTx(tx);
      if (run.status !== InvoiceStatus.POSTED) {
        throw new BadRequestException('Saldo awal belum diposting');
      }
      await this.periods.assertOpen(tx, run.tanggal);

      const piutang = await tx.salesInvoice.findMany({
        where: { saldoAwalId: run.id, status: InvoiceStatus.POSTED },
      });
      const utang = await tx.purchaseInvoice.findMany({
        where: { saldoAwalId: run.id, status: InvoiceStatus.POSTED },
      });
      const invoiceJournalIds = new Set<string>([
        ...piutang.map((p) => p.journalId).filter((x): x is string => !!x),
        ...utang.map((p) => p.journalId).filter((x): x is string => !!x),
      ]);

      // Reverse jurnal akun manual + persediaan (bukan yang link ke invoice —
      // itu direverse lewat inv.journalId di bawah supaya tidak dobel-reverse).
      const otherJournals = await tx.journal.findMany({
        where: { sumber: JournalSource.SALDO_AWAL, sumberRef: run.id, status: JournalStatus.POSTED },
      });
      for (const j of otherJournals) {
        if (invoiceJournalIds.has(j.id)) continue;
        await this.journals.reverseInTx(tx, j.id, { alasan: `Void saldo awal: ${alasan}` });
      }

      for (const inv of piutang) {
        if (inv.journalId) {
          await this.journals.reverseInTx(tx, inv.journalId, { alasan: `Void saldo awal: ${alasan}` });
        }
        await tx.salesInvoice.update({
          where: { id: inv.id },
          data: {
            status: InvoiceStatus.CANCELLED, cancelledAt: new Date(),
            cancelledById: userId, cancelledRequestedById: validRequester,
          },
        });
      }
      for (const inv of utang) {
        if (inv.journalId) {
          await this.journals.reverseInTx(tx, inv.journalId, { alasan: `Void saldo awal: ${alasan}` });
        }
        await tx.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            status: InvoiceStatus.CANCELLED, cancelledAt: new Date(),
            cancelledById: userId, cancelledRequestedById: validRequester,
          },
        });
      }

      // Reverse stok persediaan yang sudah diposting run ini.
      const persediaanRows = await tx.itemStokAwal.findMany({ where: { saldoAwalId: run.id } });
      for (const isa of persediaanRows) {
        await this.inventory.reverseInbound(tx, 'STOK_AWAL', isa.id, new Date());
        await tx.itemStokAwal.update({ where: { id: isa.id }, data: { saldoAwalId: null } });
      }

      // Restore Account.saldoAwal dari snapshot.
      const snapshotLines = await tx.saldoAwalAkunLine.findMany({ where: { saldoAwalId: run.id } });
      for (const s of snapshotLines) {
        await tx.account.update({ where: { id: s.accountId }, data: { saldoAwal: s.nilai } });
      }
      await tx.saldoAwalAkunLine.deleteMany({ where: { saldoAwalId: run.id } });

      return tx.saldoAwal.update({
        where: { id: run.id },
        data: { status: InvoiceStatus.CANCELLED, cancelledAt: new Date(), cancelledById: userId },
      });
    });
  }
}
