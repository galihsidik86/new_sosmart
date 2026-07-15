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
  /** Role approver terurut (tingkat 1..n). */
  steps: string[];
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  // ============================================================ RULES (config)

  listRules() {
    return this.tenancy.run((tx) =>
      tx.approvalRule.findMany({
        orderBy: [{ docType: 'asc' }, { minAmount: 'asc' }],
        include: { steps: { orderBy: { urutan: 'asc' } } },
      }),
    );
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

      await tx.approvalRuleStep.createMany({
        data: input.steps.map((role, i) => ({
          tenantId,
          ruleId: rule.id,
          urutan: i + 1,
          approverRole: role as never,
        })),
      });
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
  ): Promise<{ amount: Decimal; cabangId: string | null; posted: boolean }> {
    switch (docType) {
      case 'PENJUALAN': {
        const d = await tx.salesInvoice.findUnique({
          where: { id: docId },
          select: { totalNetto: true, cabangId: true, status: true },
        });
        if (!d) throw new NotFoundException('Faktur penjualan tidak ditemukan');
        return { amount: new Decimal(d.totalNetto), cabangId: d.cabangId, posted: d.status !== 'DRAFT' };
      }
      case 'PEMBELIAN': {
        const d = await tx.purchaseInvoice.findUnique({
          where: { id: docId },
          select: { totalNetto: true, cabangId: true, status: true },
        });
        if (!d) throw new NotFoundException('Tagihan pembelian tidak ditemukan');
        return { amount: new Decimal(d.totalNetto), cabangId: d.cabangId, posted: d.status !== 'DRAFT' };
      }
      case 'KAS_BANK': {
        const d = await tx.cashBankEntry.findUnique({
          where: { id: docId },
          select: { total: true, cabangId: true, status: true },
        });
        if (!d) throw new NotFoundException('Bukti kas/bank tidak ditemukan');
        return { amount: new Decimal(d.total), cabangId: d.cabangId, posted: d.status !== 'DRAFT' };
      }
      case 'JURNAL': {
        const d = await tx.journal.findUnique({
          where: { id: docId },
          select: { totalDebit: true, cabangId: true, status: true },
        });
        if (!d) throw new NotFoundException('Jurnal tidak ditemukan');
        return { amount: new Decimal(d.totalDebit), cabangId: d.cabangId, posted: d.status !== JournalStatus.DRAFT };
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
      const expected = roles[req.currentStep - 1];
      // OWNER boleh menyetujui langkah apa pun (mencegah deadlock); selain itu
      // role user harus persis role langkah ini.
      if (role !== 'OWNER' && role !== expected) {
        throw new ForbiddenException(
          `Langkah ini harus disetujui oleh ${expected}. Role Anda: ${role}.`,
        );
      }

      await tx.approvalAction.create({
        data: {
          tenantId,
          requestId,
          urutan: req.currentStep,
          approverRole: expected as never,
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
    const { role } = this.ctx.require();
    return this.tenancy.run(async (tx) => {
      const reqs = await tx.approvalRequest.findMany({
        where: { status: 'MENUNGGU' },
        orderBy: { createdAt: 'asc' },
      });
      return reqs
        .filter((r) => {
          const expected = r.stepRoles.split(',')[r.currentStep - 1];
          return role === 'OWNER' || role === expected;
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
