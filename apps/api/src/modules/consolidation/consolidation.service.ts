import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditAction, JournalStatus, NormalBalance, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { readLogoDataUri } from '../../common/pdf/logo.js';
import {
  computeConsolidation,
  type EntityAccount,
  type EntityMeta,
  type IcDoc,
  type IcSide,
} from './consolidation.engine.js';

export type { IcDoc, IcSide } from './consolidation.engine.js';

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

  /** Nama + logo tenant induk (untuk header ekspor PDF/Excel). */
  async brand(): Promise<{ nama: string; logo: string | null }> {
    // Scope ke tenant induk aktif: RLS tenants_select mengizinkan user melihat
    // semua tenant tempat ia jadi anggota, jadi findFirst polos bisa salah tenant.
    const tenantId = this.ctx.require().tenantId;
    const t = await this.tenancy.run((tx) => tx.tenant.findFirst({ where: { id: tenantId }, select: { nama: true, logoUrl: true } }));
    return { nama: t?.nama ?? 'Perusahaan', logo: await readLogoDataUri(t?.logoUrl ?? null) };
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
    const entities: EntityMeta[] = [
      {
        tenantId: parentTenantId, nama: names.get(parentTenantId) ?? 'Induk',
        ownershipPct: new Decimal(100), isParent: true,
        acquisitionCost: null, acquisitionNetAssets: null,
      },
    ];
    const skipped: string[] = [];
    for (const m of group.members) {
      if (names.has(m.memberTenantId)) {
        entities.push({
          tenantId: m.memberTenantId,
          nama: names.get(m.memberTenantId)!,
          ownershipPct: new Decimal(m.ownershipPct),
          isParent: false,
          acquisitionCost: m.acquisitionCost != null ? new Decimal(m.acquisitionCost) : null,
          acquisitionNetAssets: m.acquisitionNetAssets != null ? new Decimal(m.acquisitionNetAssets) : null,
        });
      } else {
        skipped.push(m.memberTenantId);
      }
    }

    // 4. Baca balances tiap entitas dalam konteks RLS-nya sendiri (satu-satunya I/O).
    const groupTenantSet = new Set(entities.map((e) => e.tenantId));
    const perEntity = new Map<string, EntityAccount[]>();
    const perEntityIc = new Map<string, { receivable: Map<string, IcSide>; payable: Map<string, IcSide> }>();
    const entityPeriodStatus = new Map<string, string | null>();
    for (const e of entities) {
      const data = await this.tenancy.runAs(e.tenantId, userId, async (tx) => ({
        accounts: await this.entityBalances(tx, startDate, endDate),
        ic: await this.icBalances(tx, endDate, groupTenantSet),
        // Status periode buku yang memuat endDate (untuk peringatan kelengkapan data).
        period: await tx.fiscalPeriod.findFirst({
          where: { startDate: { lte: endDate }, endDate: { gte: endDate } },
          select: { status: true },
        }),
      }));
      perEntity.set(e.tenantId, data.accounts);
      perEntityIc.set(e.tenantId, data.ic);
      entityPeriodStatus.set(e.tenantId, data.period?.status ?? null);
    }

    // 5. Semua perhitungan di mesin murni (deterministik, ter-unit-test).
    const result = computeConsolidation({
      group: { id: group.id, nama: group.nama },
      entities, perEntity, perEntityIc, names, skipped, startDate, endDate, entityPeriodStatus,
    });

    // 6. Audit trail: catat siapa men-generate laporan, kapan, dengan parameter apa.
    // Best-effort — kegagalan audit tidak boleh menggagalkan laporan.
    try {
      await this.tenancy.run((tx) =>
        tx.auditLog.create({
          data: {
            tenantId: parentTenantId, userId, action: AuditAction.GENERATE,
            entity: 'ConsolidationReport', entityId: group.id,
            after: {
              groupNama: group.nama, startDate: opts.startDate ?? null, endDate: opts.endDate,
              jumlahEntitas: entities.length, skipped: skipped.length,
              balanced: result.integritas.neracaBalanced,
              icTerekonsiliasi: result.integritas.icTerekonsiliasi,
            },
          },
        }),
      );
    } catch {
      /* audit best-effort */
    }

    return result;
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
