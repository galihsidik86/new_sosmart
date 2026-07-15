import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AccountKind, JournalStatus, NormalBalance, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

export interface IcDoc {
  nomor: string | null;
  tanggal: Date;
  kontak: string;
  netto: string;
  dibayar: string;
  outstanding: string;
}
export interface IcSide {
  total: Decimal;
  docs: IcDoc[];
}

interface EntityAccount {
  kode: string;
  nama: string;
  kind: AccountKind;
  normalBalance: NormalBalance;
  klasifikasiNeraca: string | null;
  isIntercompany: boolean;
  /** Saldo akhir signed (normal-positif) s/d endDate — untuk Neraca. */
  neracaSigned: Decimal;
  /** Mutasi signed dalam rentang [startDate,endDate] — untuk Laba Rugi. */
  plSigned: Decimal;
}

@Injectable()
export class ConsolidationService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  // ============================================================ CONFIG

  async listGroups() {
    // Nama tenant anggota (lintas tenant) — tx terpisah supaya tidak nested.
    const names = await this.userTenantNames();
    const groups = await this.tenancy.run((tx) =>
      tx.group.findMany({
        orderBy: { nama: 'asc' },
        include: { members: { orderBy: { createdAt: 'asc' } } },
      }),
    );
    return groups.map((g) => ({
        id: g.id,
        nama: g.nama,
        members: g.members.map((m) => ({
          id: m.id,
          memberTenantId: m.memberTenantId,
          nama: names.get(m.memberTenantId) ?? '(tenant di luar keanggotaan Anda)',
          ownershipPct: m.ownershipPct.toFixed(2),
          authorized: names.has(m.memberTenantId),
        })),
      }));
  }

  createGroup(nama: string) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run((tx) => tx.group.create({ data: { tenantId, nama: nama.trim() } }));
  }

  async deleteGroup(id: string) {
    return this.tenancy.run(async (tx) => {
      const g = await tx.group.findUnique({ where: { id } });
      if (!g) throw new NotFoundException('Grup tidak ditemukan');
      await tx.group.delete({ where: { id } });
      return { removed: true };
    });
  }

  async addMember(
    groupId: string,
    memberTenantId: string,
    ownershipPct: string,
    acq?: { cost?: string; netAssets?: string; date?: string },
  ) {
    const tenantId = this.ctx.require().tenantId;
    if (memberTenantId === tenantId) {
      throw new BadRequestException('Tenant induk otomatis termasuk — tidak perlu ditambah sebagai anggota');
    }
    const names = await this.userTenantNames();
    if (!names.has(memberTenantId)) {
      throw new ForbiddenException('Anda bukan anggota tenant tersebut — tidak bisa dikonsolidasi');
    }
    const pct = new Decimal(ownershipPct);
    if (pct.lte(0) || pct.gt(100)) throw new BadRequestException('Kepemilikan harus 0–100%');
    return this.tenancy.run(async (tx) => {
      const g = await tx.group.findUnique({ where: { id: groupId } });
      if (!g) throw new NotFoundException('Grup tidak ditemukan');
      try {
        return await tx.groupMember.create({
          data: {
            tenantId, groupId, memberTenantId, ownershipPct: pct.toFixed(4),
            acquisitionCost: acq?.cost ? new Decimal(acq.cost).toFixed(2) : null,
            acquisitionNetAssets: acq?.netAssets ? new Decimal(acq.netAssets).toFixed(2) : null,
            acquisitionDate: acq?.date ? new Date(acq.date + 'T00:00:00Z') : null,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException('Tenant sudah menjadi anggota grup ini');
        }
        throw e;
      }
    });
  }

  async removeMember(memberId: string) {
    return this.tenancy.run(async (tx) => {
      const m = await tx.groupMember.findUnique({ where: { id: memberId } });
      if (!m) throw new NotFoundException('Anggota tidak ditemukan');
      await tx.groupMember.delete({ where: { id: memberId } });
      return { removed: true };
    });
  }

  /** Tenant kandidat anggota = tenant lain yang user-nya jadi anggota. */
  async candidateTenants() {
    const currentTenant = this.ctx.require().tenantId;
    const names = await this.userTenantNames();
    return [...names.entries()]
      .filter(([id]) => id !== currentTenant)
      .map(([id, nama]) => ({ tenantId: id, nama }));
  }

  /** Map tenantId → nama untuk SEMUA tenant yang user-nya jadi anggota (RLS: user lihat membership sendiri). */
  private async userTenantNames(): Promise<Map<string, string>> {
    const userId = this.ctx.require().userId;
    const rows = await this.tenancy.runAsUser(userId, (tx) =>
      tx.membership.findMany({
        where: { userId },
        select: { tenantId: true, tenant: { select: { nama: true } } },
      }),
    );
    return new Map(rows.map((r) => [r.tenantId, r.tenant.nama]));
  }

  // ============================================================ ENGINE

  /**
   * Konsolidasi penuh: gabung 100% tiap entitas, eliminasi akun intercompany,
   * hitung kepentingan minoritas (NCI). Neraca s/d endDate; Laba Rugi rentang.
   */
  async consolidate(opts: { groupId: string; startDate?: string; endDate: string }) {
    const userId = this.ctx.require().userId;
    const parentTenantId = this.ctx.require().tenantId;
    const endDate = new Date(opts.endDate + 'T23:59:59Z');
    const startDate = opts.startDate ? new Date(opts.startDate + 'T00:00:00Z') : null;
    if (Number.isNaN(endDate.getTime())) throw new BadRequestException('endDate tidak valid');

    // 1. Grup + anggota (konteks induk).
    const group = await this.tenancy.run((tx) =>
      tx.group.findUnique({ where: { id: opts.groupId }, include: { members: true } }),
    );
    if (!group) throw new NotFoundException('Grup tidak ditemukan');

    // 2. Tenant yang diotorisasi (user anggota).
    const names = await this.userTenantNames();

    // 3. Susun daftar entitas: induk (100%) + anggota terotorisasi.
    const entities: Array<{ tenantId: string; nama: string; ownershipPct: Decimal; isParent: boolean }> = [
      { tenantId: parentTenantId, nama: names.get(parentTenantId) ?? 'Induk', ownershipPct: new Decimal(100), isParent: true },
    ];
    const skipped: string[] = [];
    for (const m of group.members) {
      if (names.has(m.memberTenantId)) {
        entities.push({
          tenantId: m.memberTenantId,
          nama: names.get(m.memberTenantId)!,
          ownershipPct: new Decimal(m.ownershipPct),
          isParent: false,
        });
      } else {
        skipped.push(m.memberTenantId);
      }
    }

    // 4. Baca balances tiap entitas dalam konteks RLS-nya sendiri.
    const groupTenantSet = new Set(entities.map((e) => e.tenantId));
    const perEntity = new Map<string, EntityAccount[]>();
    const perEntityIc = new Map<string, { receivable: Map<string, IcSide>; payable: Map<string, IcSide> }>();
    for (const e of entities) {
      const data = await this.tenancy.runAs(e.tenantId, userId, async (tx) => ({
        accounts: await this.entityBalances(tx, startDate, endDate),
        ic: await this.icBalances(tx, endDate, groupTenantSet),
      }));
      perEntity.set(e.tenantId, data.accounts);
      perEntityIc.set(e.tenantId, data.ic);
    }

    // 5. Agregasi per kode + eliminasi intercompany.
    interface Row { kode: string; nama: string; kind: AccountKind; klasifikasi: string | null; isIntercompany: boolean; combined: Decimal; }
    const neracaByKode = new Map<string, Row>();
    const plByKode = new Map<string, Row>();
    for (const e of entities) {
      for (const a of perEntity.get(e.tenantId)!) {
        const isPL =
          a.kind === AccountKind.PENDAPATAN || a.kind === AccountKind.PENDAPATAN_LAIN ||
          a.kind === AccountKind.BEBAN || a.kind === AccountKind.BEBAN_POKOK || a.kind === AccountKind.BEBAN_LAIN;
        const target = isPL ? plByKode : neracaByKode;
        const nilai = isPL
          ? this.plContribution(a)
          : this.neracaContribution(a);
        const cur = target.get(a.kode) ?? {
          kode: a.kode, nama: a.nama, kind: a.kind, klasifikasi: a.klasifikasiNeraca,
          isIntercompany: a.isIntercompany, combined: new Decimal(0),
        };
        cur.combined = cur.combined.plus(nilai);
        cur.isIntercompany = cur.isIntercompany || a.isIntercompany;
        target.set(a.kode, cur);
      }
    }

    const mkRows = (m: Map<string, Row>) =>
      [...m.values()]
        .filter((r) => !r.combined.eq(0) || r.isIntercompany)
        .sort((a, b) => a.kode.localeCompare(b.kode))
        .map((r) => ({
          kode: r.kode, nama: r.nama, kind: r.kind, klasifikasi: r.klasifikasi,
          isIntercompany: r.isIntercompany,
          combined: r.combined.toFixed(2),
          eliminasi: (r.isIntercompany ? r.combined.negated() : new Decimal(0)).toFixed(2),
          konsolidasi: (r.isIntercompany ? new Decimal(0) : r.combined).toFixed(2),
        }));

    const neracaRows = mkRows(neracaByKode);
    const plRows = mkRows(plByKode);

    // 6. Goodwill (metode akuisisi) = biaya perolehan − milik% × aset bersih akuisisi.
    let totalGoodwill = new Decimal(0);
    const goodwillDetail: Array<{ nama: string; goodwill: string }> = [];
    for (const e of entities) {
      if (e.isParent) continue;
      const gm = group.members.find((m) => m.memberTenantId === e.tenantId);
      if (gm?.acquisitionCost != null && gm?.acquisitionNetAssets != null) {
        const gw = new Decimal(gm.acquisitionCost).minus(
          new Decimal(gm.acquisitionNetAssets).times(e.ownershipPct).div(100),
        );
        totalGoodwill = totalGoodwill.plus(gw);
        goodwillDetail.push({ nama: e.nama, goodwill: gw.toFixed(2) });
      }
    }
    if (!totalGoodwill.eq(0)) {
      neracaRows.push({
        kode: 'ZZ-GW', nama: 'Goodwill (konsolidasi)', kind: AccountKind.ASET,
        klasifikasi: 'ASET_TETAP', isIntercompany: false,
        combined: totalGoodwill.toFixed(2), eliminasi: '0.00', konsolidasi: totalGoodwill.toFixed(2),
      });
    }

    // 7. Total Neraca (setelah eliminasi IC akun + goodwill).
    const sumKons = (rows: typeof neracaRows, pred: (r: (typeof neracaRows)[number]) => boolean) =>
      rows.filter(pred).reduce((a, r) => a.plus(new Decimal(r.konsolidasi)), new Decimal(0));

    const totalAset = sumKons(neracaRows, (r) => r.kind === AccountKind.ASET);
    const totalLiab = sumKons(neracaRows, (r) => r.kind === AccountKind.LIABILITAS);
    const totalEkuitasKons = totalAset.minus(totalLiab); // identitas neraca (incl goodwill)
    const ekuitasAkunKons = sumKons(neracaRows, (r) => r.kind === AccountKind.EKUITAS);
    // Eliminasi ekuitas anak (investasi induk vs ekuitas akuisisi) = plug supaya
    // baris ekuitas + eliminasi = total ekuitas konsolidasi.
    const eliminasiEkuitas = totalEkuitasKons.minus(ekuitasAkunKons);

    // 8. Laba Rugi konsolidasi.
    const pendapatan = plRows
      .filter((r) => r.kind === AccountKind.PENDAPATAN || r.kind === AccountKind.PENDAPATAN_LAIN)
      .reduce((a, r) => a.plus(new Decimal(r.konsolidasi)), new Decimal(0));
    const beban = plRows
      .filter((r) => r.kind === AccountKind.BEBAN || r.kind === AccountKind.BEBAN_POKOK || r.kind === AccountKind.BEBAN_LAIN)
      .reduce((a, r) => a.plus(new Decimal(r.konsolidasi)), new Decimal(0));
    const labaBersihKons = pendapatan.minus(beban);

    // 8. Kepentingan minoritas (NCI): per anak, minority% × aset bersih anak.
    let nci = new Decimal(0);
    let labaNci = new Decimal(0);
    const entityDetail = entities.map((e) => {
      const accts = perEntity.get(e.tenantId)!;
      const aset = accts.filter((a) => a.kind === AccountKind.ASET)
        .reduce((s, a) => s.plus(this.neracaContribution(a)), new Decimal(0));
      const liab = accts.filter((a) => a.kind === AccountKind.LIABILITAS)
        .reduce((s, a) => s.plus(this.neracaContribution(a)), new Decimal(0));
      const netAssets = aset.minus(liab);
      const inc = accts.reduce((s, a) => {
        const isPL = a.kind === AccountKind.PENDAPATAN || a.kind === AccountKind.PENDAPATAN_LAIN ||
          a.kind === AccountKind.BEBAN || a.kind === AccountKind.BEBAN_POKOK || a.kind === AccountKind.BEBAN_LAIN;
        if (!isPL) return s;
        const c = this.plContribution(a);
        const isPend = a.kind === AccountKind.PENDAPATAN || a.kind === AccountKind.PENDAPATAN_LAIN;
        return isPend ? s.plus(c) : s.minus(c);
      }, new Decimal(0));
      const minoritas = new Decimal(100).minus(e.ownershipPct).div(100);
      if (!e.isParent) {
        nci = nci.plus(netAssets.times(minoritas));
        labaNci = labaNci.plus(inc.times(minoritas));
      }
      return {
        tenantId: e.tenantId, nama: e.nama, ownershipPct: e.ownershipPct.toFixed(2),
        isParent: e.isParent, netAssets: netAssets.toFixed(2), netIncome: inc.toFixed(2),
      };
    });

    // 9. Rekonsiliasi intercompany level-transaksi (piutang E→P vs utang P→E).
    const nameOf = (id: string) => names.get(id) ?? id;
    const emptySide: IcSide = { total: new Decimal(0), docs: [] };
    const icRekon: Array<{
      dari: string; ke: string; piutang: string; utangLawan: string; selisih: string; cocok: boolean;
      piutangDocs: IcDoc[]; utangDocs: IcDoc[];
    }> = [];
    for (const e of entities) {
      for (const [partnerId, side] of perEntityIc.get(e.tenantId)!.receivable) {
        if (!groupTenantSet.has(partnerId)) continue;
        const partnerSide = perEntityIc.get(partnerId)?.payable.get(e.tenantId) ?? emptySide;
        const d = side.total.minus(partnerSide.total);
        icRekon.push({
          dari: e.nama, ke: nameOf(partnerId),
          piutang: side.total.toFixed(2), utangLawan: partnerSide.total.toFixed(2),
          selisih: d.toFixed(2), cocok: d.abs().lte(new Decimal('0.5')),
          piutangDocs: side.docs, utangDocs: partnerSide.docs,
        });
      }
    }

    const ekuitasInduk = totalEkuitasKons.minus(nci);
    const labaInduk = labaBersihKons.minus(labaNci);

    // Validasi: Aset = Liab + Ekuitas konsolidasi.
    const selisih = totalAset.minus(totalLiab.plus(totalEkuitasKons));

    return {
      group: { id: group.id, nama: group.nama },
      periode: { startDate: startDate ?? null, endDate },
      entities: entityDetail,
      skippedTenantIds: skipped,
      goodwill: { total: totalGoodwill.toFixed(2), detail: goodwillDetail },
      icRekon,
      neraca: {
        rows: neracaRows,
        totalAset: totalAset.toFixed(2),
        totalLiabilitas: totalLiab.toFixed(2),
        totalEkuitasKonsolidasi: totalEkuitasKons.toFixed(2),
        eliminasiEkuitasAkuisisi: eliminasiEkuitas.toFixed(2),
        ekuitasIndukInduk: ekuitasInduk.toFixed(2),
        kepentinganMinoritas: nci.toFixed(2),
      },
      labaRugi: {
        rows: plRows,
        pendapatan: pendapatan.toFixed(2),
        beban: beban.toFixed(2),
        labaBersihKonsolidasi: labaBersihKons.toFixed(2),
        labaIndukInduk: labaInduk.toFixed(2),
        labaMinoritas: labaNci.toFixed(2),
      },
      balanced: selisih.abs().lte(new Decimal('0.5')),
      selisih: selisih.toFixed(2),
    };
  }

  /**
   * Saldo intercompany per partner (dalam tx satu tenant): piutang dari faktur
   * penjualan ke customer ber-partner, utang dari tagihan pembelian ke vendor
   * ber-partner. Outstanding = netto − dibayar, faktur POSTED/PARTIAL s/d endDate.
   */
  private async icBalances(
    tx: Prisma.TransactionClient,
    endDate: Date,
    groupTenantSet: Set<string>,
  ): Promise<{ receivable: Map<string, IcSide>; payable: Map<string, IcSide> }> {
    const receivable = new Map<string, IcSide>();
    const payable = new Map<string, IcSide>();
    const add = (m: Map<string, IcSide>, p: string, doc: IcDoc) => {
      const cur = m.get(p) ?? { total: new Decimal(0), docs: [] as IcDoc[] };
      cur.total = cur.total.plus(new Decimal(doc.outstanding));
      cur.docs.push(doc);
      m.set(p, cur);
    };
    const sales = await tx.salesInvoice.findMany({
      where: {
        status: { in: ['POSTED', 'PARTIAL'] }, tanggal: { lte: endDate },
        customer: { partnerTenantId: { not: null } },
      },
      select: {
        nomor: true, tanggal: true, totalNetto: true, totalDibayar: true,
        customer: { select: { partnerTenantId: true, nama: true } },
      },
      orderBy: { tanggal: 'asc' },
    });
    for (const s of sales) {
      const p = s.customer.partnerTenantId!;
      if (!groupTenantSet.has(p)) continue;
      const out = new Decimal(s.totalNetto).minus(new Decimal(s.totalDibayar));
      add(receivable, p, {
        nomor: s.nomor, tanggal: s.tanggal, kontak: s.customer.nama,
        netto: new Decimal(s.totalNetto).toFixed(2), dibayar: new Decimal(s.totalDibayar).toFixed(2),
        outstanding: out.toFixed(2),
      });
    }
    const purch = await tx.purchaseInvoice.findMany({
      where: {
        status: { in: ['POSTED', 'PARTIAL'] }, tanggal: { lte: endDate },
        vendor: { partnerTenantId: { not: null } },
      },
      select: {
        nomor: true, tanggal: true, totalNetto: true, totalDibayar: true,
        vendor: { select: { partnerTenantId: true, nama: true } },
      },
      orderBy: { tanggal: 'asc' },
    });
    for (const pu of purch) {
      const p = pu.vendor.partnerTenantId!;
      if (!groupTenantSet.has(p)) continue;
      const out = new Decimal(pu.totalNetto).minus(new Decimal(pu.totalDibayar));
      add(payable, p, {
        nomor: pu.nomor, tanggal: pu.tanggal, kontak: pu.vendor.nama,
        netto: new Decimal(pu.totalNetto).toFixed(2), dibayar: new Decimal(pu.totalDibayar).toFixed(2),
        outstanding: out.toFixed(2),
      });
    }
    return { receivable, payable };
  }

  /** Kontribusi akun ke seksi Neraca (kontra dibalik supaya mengurangi). */
  private neracaContribution(a: EntityAccount): Decimal {
    const expected = a.kind === AccountKind.ASET ? NormalBalance.DEBIT : NormalBalance.KREDIT;
    return a.normalBalance === expected ? a.neracaSigned : a.neracaSigned.negated();
  }

  /** Kontribusi akun ke Laba Rugi (pendapatan/beban positif ke arah masing-masing). */
  private plContribution(a: EntityAccount): Decimal {
    const expected =
      a.kind === AccountKind.PENDAPATAN || a.kind === AccountKind.PENDAPATAN_LAIN
        ? NormalBalance.KREDIT
        : NormalBalance.DEBIT;
    return a.normalBalance === expected ? a.plSigned : a.plSigned.negated();
  }

  /** Saldo per akun (signed normal-positif) untuk satu tenant (dalam tx-nya). */
  private async entityBalances(
    tx: Prisma.TransactionClient,
    startDate: Date | null,
    endDate: Date,
  ): Promise<EntityAccount[]> {
    const accounts = await tx.account.findMany({
      where: { isActive: true },
      select: {
        id: true, kode: true, nama: true, kind: true, normalBalance: true,
        klasifikasiNeraca: true, isIntercompany: true, saldoAwal: true,
      },
    });
    const cum = await tx.journalLine.groupBy({
      by: ['accountId'],
      where: { journal: { status: JournalStatus.POSTED, tanggal: { lte: endDate } } },
      _sum: { debit: true, kredit: true },
    });
    const cumMap = new Map(cum.map((r) => [r.accountId, r]));
    const rng = startDate
      ? await tx.journalLine.groupBy({
          by: ['accountId'],
          where: { journal: { status: JournalStatus.POSTED, tanggal: { gte: startDate, lte: endDate } } },
          _sum: { debit: true, kredit: true },
        })
      : cum;
    const rngMap = new Map(rng.map((r) => [r.accountId, r]));

    return accounts.map((a) => {
      const c = cumMap.get(a.id);
      const r = rngMap.get(a.id);
      const cd = new Decimal(c?._sum.debit ?? 0), ck = new Decimal(c?._sum.kredit ?? 0);
      const rd = new Decimal(r?._sum.debit ?? 0), rk = new Decimal(r?._sum.kredit ?? 0);
      const cumSigned = a.normalBalance === NormalBalance.DEBIT ? cd.minus(ck) : ck.minus(cd);
      const plSigned = a.normalBalance === NormalBalance.DEBIT ? rd.minus(rk) : rk.minus(rd);
      return {
        kode: a.kode, nama: a.nama, kind: a.kind, normalBalance: a.normalBalance,
        klasifikasiNeraca: a.klasifikasiNeraca, isIntercompany: a.isIntercompany,
        neracaSigned: new Decimal(a.saldoAwal).plus(cumSigned),
        plSigned,
      };
    });
  }
}
