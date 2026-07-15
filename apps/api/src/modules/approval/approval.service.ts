import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { ApprovalDocType, JournalStatus, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

type DocType = ApprovalDocType; // 'PENJUALAN' | 'PEMBELIAN' | 'KAS_BANK' | 'JURNAL'

export interface UpsertRuleInput {
  docType: DocType;
  minAmount: string;
  isActive?: boolean;
  catatan?: string;
  /** Langkah approver terurut: role, ATAU user spesifik (per-individu). */
  steps: Array<{ role?: string; userId?: string }>;
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  // ============================================================ RULES (config)

  async listRules() {
    const rules = await this.tenancy.run((tx) =>
      tx.approvalRule.findMany({
        orderBy: [{ docType: 'asc' }, { minAmount: 'asc' }],
        include: { steps: { orderBy: { urutan: 'asc' } } },
      }),
    );
    const userIds = [
      ...new Set(rules.flatMap((r) => r.steps.map((s) => s.approverUserId).filter((x): x is string => !!x))),
    ];
    const users = userIds.length
      ? await this.tenancy.run((tx) => tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nama: true } }))
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.nama]));
    return rules.map((r) => ({
      ...r,
      steps: r.steps.map((s) => ({
        urutan: s.urutan,
        approverRole: s.approverRole,
        approverUserId: s.approverUserId,
        approverNama: s.approverUserId ? nameById.get(s.approverUserId) ?? '(user)' : null,
      })),
    }));
  }

  async upsertRule(id: string | null, input: UpsertRuleInput) {
    const tenantId = this.ctx.require().tenantId;
    if (!input.steps || input.steps.length === 0) {
      throw new BadRequestException('Minimal 1 langkah approver');
    }
    return this.tenancy.run(async (tx) => {
      const data = {
        docType: input.docType,
        minAmount: new Decimal(input.minAmount).toFixed(2),
        isActive: input.isActive ?? true,
        catatan: input.catatan?.trim() || null,
      };
      const rule = id
        ? await (async () => {
            const ex = await tx.approvalRule.findUnique({ where: { id } });
            if (!ex) throw new NotFoundException('Aturan tidak ditemukan');
            await tx.approvalRuleStep.deleteMany({ where: { ruleId: id } });
            return tx.approvalRule.update({ where: { id }, data });
          })()
        : await tx.approvalRule.create({ data: { tenantId, ...data } });

      // Resolve tiap langkah: user spesifik → ambil role-nya dari membership;
      // else pakai role langsung.
      const stepsData: Array<{ tenantId: string; ruleId: string; urutan: number; approverRole: string; approverUserId: string | null }> = [];
      for (let i = 0; i < input.steps.length; i++) {
        const st = input.steps[i]!;
        let role = st.role;
        const userId = st.userId ?? null;
        if (userId) {
          const m = await tx.membership.findUnique({
            where: { userId_tenantId: { userId, tenantId } },
            select: { role: true },
          });
          if (!m) throw new BadRequestException('User approver bukan anggota tenant');
          role = m.role;
        }
        if (!role) throw new BadRequestException('Tiap langkah butuh role atau user');
        stepsData.push({ tenantId, ruleId: rule.id, urutan: i + 1, approverRole: role, approverUserId: userId });
      }
      await tx.approvalRuleStep.createMany({ data: stepsData as never });
      return rule;
    });
  }

  async deleteRule(id: string) {
    return this.tenancy.run(async (tx) => {
      const ex = await tx.approvalRule.findUnique({ where: { id } });
      if (!ex) throw new NotFoundException('Aturan tidak ditemukan');
      await tx.approvalRule.delete({ where: { id } });
      return { removed: true };
    });
  }

  // ============================================================ MATCHING

  /**
   * Aturan yang cocok utk (docType, amount): aktif, minAmount ≤ amount,
   * minAmount tertinggi. null → dokumen tidak perlu approval.
   */
  private async matchedRule(tx: Prisma.TransactionClient, docType: DocType, amount: Decimal) {
    const rules = await tx.approvalRule.findMany({
      where: { docType, isActive: true },
      include: { steps: { orderBy: { urutan: 'asc' } } },
      orderBy: { minAmount: 'desc' },
    });
    for (const r of rules) {
      if (amount.gte(new Decimal(r.minAmount))) return r;
    }
    return null;
  }

  /** Metadata dokumen (nilai + cabang + status) utk submit. */
  private async docMeta(
    tx: Prisma.TransactionClient,
    docType: DocType,
    docId: string,
  ): Promise<{ amount: Decimal; cabangId: string | null; posted: boolean; eligible: boolean }> {
    switch (docType) {
      case 'PENJUALAN': {
        const d = await tx.salesInvoice.findUnique({
          where: { id: docId },
          select: { totalNetto: true, cabangId: true, status: true },
        });
        if (!d) throw new NotFoundException('Faktur penjualan tidak ditemukan');
        return { amount: new Decimal(d.totalNetto), cabangId: d.cabangId, posted: d.status !== 'DRAFT', eligible: true };
      }
      case 'PEMBELIAN': {
        const d = await tx.purchaseInvoice.findUnique({
          where: { id: docId },
          select: { totalNetto: true, cabangId: true, status: true },
        });
        if (!d) throw new NotFoundException('Tagihan pembelian tidak ditemukan');
        return { amount: new Decimal(d.totalNetto), cabangId: d.cabangId, posted: d.status !== 'DRAFT', eligible: true };
      }
      case 'KAS_BANK': {
        const d = await tx.cashBankEntry.findUnique({
          where: { id: docId },
          select: { total: true, cabangId: true, status: true, tipe: true },
        });
        if (!d) throw new NotFoundException('Bukti kas/bank tidak ditemukan');
        // Approval kas/bank hanya untuk uang KELUAR (PAYMENT).
        return { amount: new Decimal(d.total), cabangId: d.cabangId, posted: d.status !== 'DRAFT', eligible: d.tipe === 'PAYMENT' };
      }
      case 'JURNAL': {
        const d = await tx.journal.findUnique({
          where: { id: docId },
          select: { totalDebit: true, cabangId: true, status: true, sumber: true },
        });
        if (!d) throw new NotFoundException('Jurnal tidak ditemukan');
        // Approval jurnal hanya untuk jurnal MANUAL.
        return { amount: new Decimal(d.totalDebit), cabangId: d.cabangId, posted: d.status !== JournalStatus.DRAFT, eligible: d.sumber === 'MANUAL' };
      }
      default:
        throw new BadRequestException('Jenis dokumen tidak dikenal');
    }
  }

  // ============================================================ SUBMIT / ACT

  /** Ajukan approval untuk dokumen DRAFT. */
  async submit(docType: DocType, docId: string) {
    const userId = this.ctx.require().userId;
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const meta = await this.docMeta(tx, docType, docId);
      if (meta.posted) throw new BadRequestException('Dokumen sudah diposting, tidak perlu approval');
      if (!meta.eligible) throw new BadRequestException('Dokumen ini tidak memerlukan approval');

      const rule = await this.matchedRule(tx, docType, meta.amount);
      if (!rule) {
        throw new BadRequestException(
          'Dokumen ini di bawah ambang approval — bisa langsung diposting.',
        );
      }

      const existing = await tx.approvalRequest.findFirst({
        where: { docType, docId, status: { in: ['MENUNGGU', 'DISETUJUI'] } },
      });
      if (existing) {
        throw new BadRequestException(
          existing.status === 'MENUNGGU' ? 'Sudah diajukan, menunggu approval.' : 'Sudah disetujui.',
        );
      }

      const stepRoles = rule.steps.map((s) => s.approverRole);
      const stepUserIds = rule.steps.map((s) => s.approverUserId ?? '');
      return tx.approvalRequest.create({
        data: {
          tenantId,
          docType,
          docId,
          cabangId: meta.cabangId,
          amount: meta.amount.toFixed(2),
          status: 'MENUNGGU',
          currentStep: 1,
          totalSteps: stepRoles.length,
          stepRoles: stepRoles.join(','),
          stepUserIds: stepUserIds.join(','),
          requestedById: userId,
        },
      });
    });
  }

  /** Approver bertindak (setuju/tolak) pada langkah yang sedang menunggu. */
  async act(requestId: string, action: 'SETUJU' | 'TOLAK', catatan?: string) {
    const { userId, role, tenantId } = this.ctx.require();
    return this.tenancy.run(async (tx) => {
      const req = await tx.approvalRequest.findUnique({ where: { id: requestId } });
      if (!req) throw new NotFoundException('Permintaan approval tidak ditemukan');
      if (req.status !== 'MENUNGGU') {
        throw new BadRequestException(`Permintaan sudah ${req.status}`);
      }
      const roles = req.stepRoles.split(',');
      const users = (req.stepUserIds || '').split(',');
      const expectedRole = roles[req.currentStep - 1];
      const expectedUser = users[req.currentStep - 1] || '';
      // OWNER boleh menyetujui langkah apa pun (mencegah deadlock). Selain itu:
      // langkah per-individu → user harus persis; langkah per-role → role cocok.
      if (role !== 'OWNER') {
        if (expectedUser) {
          if (userId !== expectedUser) {
            throw new ForbiddenException('Langkah ini hanya bisa disetujui oleh user yang ditunjuk.');
          }
        } else if (role !== expectedRole) {
          throw new ForbiddenException(
            `Langkah ini harus disetujui oleh ${expectedRole}. Role Anda: ${role}.`,
          );
        }
      }

      await tx.approvalAction.create({
        data: {
          tenantId,
          requestId,
          urutan: req.currentStep,
          approverRole: expectedRole as never,
          approverUserId: userId,
          action,
          catatan: catatan?.trim() || null,
        },
      });

      if (action === 'TOLAK') {
        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { status: 'DITOLAK', resolvedAt: new Date() },
        });
        return { status: 'DITOLAK' };
      }
      // SETUJU
      if (req.currentStep < req.totalSteps) {
        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { currentStep: req.currentStep + 1 },
        });
        return { status: 'MENUNGGU', nextStep: req.currentStep + 1 };
      }
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'DISETUJUI', resolvedAt: new Date() },
      });
      return { status: 'DISETUJUI' };
    });
  }

  /** Inbox approver: request MENUNGGU yang langkah kininya bisa disetujui user. */
  inbox() {
    const { role, userId } = this.ctx.require();
    return this.tenancy.run(async (tx) => {
      const reqs = await tx.approvalRequest.findMany({
        where: { status: 'MENUNGGU' },
        orderBy: { createdAt: 'asc' },
      });
      return reqs
        .filter((r) => {
          if (role === 'OWNER') return true;
          const expectedUser = (r.stepUserIds || '').split(',')[r.currentStep - 1] || '';
          if (expectedUser) return userId === expectedUser;
          const expectedRole = r.stepRoles.split(',')[r.currentStep - 1];
          return role === expectedRole;
        })
        .map((r) => ({
          id: r.id,
          docType: r.docType,
          docId: r.docId,
          amount: r.amount.toFixed(2),
          currentStep: r.currentStep,
          totalSteps: r.totalSteps,
          currentRole: r.stepRoles.split(',')[r.currentStep - 1],
          createdAt: r.createdAt,
        }));
    });
  }

  /** Status approval terkini untuk sebuah dokumen (badge/detail UI). */
  statusForDoc(docType: DocType, docId: string) {
    return this.tenancy.run(async (tx) => {
      const req = await tx.approvalRequest.findFirst({
        where: { docType, docId },
        orderBy: { createdAt: 'desc' },
        include: { actions: { orderBy: { urutan: 'asc' } } },
      });
      if (!req) return { exists: false as const };
      return {
        exists: true as const,
        id: req.id,
        status: req.status,
        currentStep: req.currentStep,
        totalSteps: req.totalSteps,
        stepRoles: req.stepRoles.split(','),
        amount: req.amount.toFixed(2),
        actions: req.actions.map((a) => ({
          urutan: a.urutan, role: a.approverRole, action: a.action,
          catatan: a.catatan, actedAt: a.actedAt,
        })),
      };
    });
  }

  /**
   * Konteks approval untuk sebuah dokumen (dipakai panel di halaman dokumen):
   * apakah approval diperlukan, rantai role, dan status permintaan terkini.
   */
  docContext(docType: DocType, docId: string) {
    return this.tenancy.run(async (tx) => {
      const meta = await this.docMeta(tx, docType, docId);
      const rule = meta.eligible ? await this.matchedRule(tx, docType, meta.amount) : null;
      const req = await tx.approvalRequest.findFirst({
        where: { docType, docId },
        orderBy: { createdAt: 'desc' },
        include: { actions: { orderBy: { urutan: 'asc' } } },
      });
      return {
        required: !!rule,
        posted: meta.posted,
        amount: meta.amount.toFixed(2),
        steps: rule ? rule.steps.map((s) => s.approverRole) : [],
        request: req
          ? {
              id: req.id,
              status: req.status,
              currentStep: req.currentStep,
              totalSteps: req.totalSteps,
              stepRoles: req.stepRoles.split(','),
              actions: req.actions.map((a) => ({
                urutan: a.urutan, role: a.approverRole, action: a.action,
                catatan: a.catatan, actedAt: a.actedAt,
              })),
            }
          : null,
      };
    });
  }

  // ============================================================ GATE (post)

  /**
   * Dipanggil di dalam .post() dokumen (tx yang sama). Kalau ada aturan yang
   * cocok untuk (docType, amount) tapi belum ada ApprovalRequest DISETUJUI →
   * throw. Kalau tidak ada aturan cocok → lolos (backward-compatible).
   */
  async assertApprovedForPost(
    tx: Prisma.TransactionClient,
    docType: DocType,
    docId: string,
    amount: Decimal,
  ): Promise<void> {
    const rule = await this.matchedRule(tx, docType, amount);
    if (!rule) return; // di bawah ambang / tidak ada aturan → tidak perlu approval
    const approved = await tx.approvalRequest.findFirst({
      where: { docType, docId, status: 'DISETUJUI' },
      select: { id: true },
    });
    if (!approved) {
      throw new ForbiddenException(
        'Dokumen memerlukan persetujuan berjenjang (nilai ≥ ambang aturan). ' +
        'Ajukan approval dan selesaikan semua tingkat persetujuan sebelum posting.',
      );
    }
  }
}
