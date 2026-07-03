import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  JournalStatus,
  NormalBalance,
  Prisma,
  ProjectMemberRole,
} from '@lentera/db';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

export interface BudgetViolation {
  projectId: string;
  projectKode: string;
  projectNama: string;
  accountId: string;
  accountKode: string;
  accountNama: string;
  periode: string;         // "YYYY-MM"
  budgetAmount: string;    // Rp
  spentSoFar: string;      // Rp (sum posted signed mutasi sebelum tx ini)
  newMutasi: string;       // Rp (delta yang akan ditambah oleh tx ini)
  projectedTotal: string;  // Rp (spent + new)
  hardBlock: boolean;
}

/**
 * HttpException khusus: response body berisi payload struktural
 * agar UI bisa render list bucket + tombol "Minta Override".
 */
export class BudgetExceededException extends HttpException {
  constructor(public readonly violations: BudgetViolation[]) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'BudgetExceeded',
        message: 'Posting menembus anggaran (budget) yang sudah ditetapkan',
        violations,
      },
      HttpStatus.CONFLICT,
    );
  }
}

interface LineInput {
  accountId: string;
  projectId: string | null;
  debit: string | number | Prisma.Decimal;
  kredit: string | number | Prisma.Decimal;
}

interface JournalMeta {
  tanggal: Date;
}

/**
 * Enforcement budget per (Project × Account × Bulan).
 *
 * - Ambil budget yang match (projectId, accountId, YYYY-MM(tanggal)).
 * - Untuk tiap budget bucket, agregasi mutasi POSTED sebelumnya di bucket sama
 *   (signed = debit-kredit di-flip menurut normalBalance akun) → itu "spent".
 * - Hitung mutasi baru (juga signed) dari lines yang mau di-POST.
 * - Kalau `spent + new > budget.amount`:
 *     • budget.hardBlock === true → BudgetExceededException (kecuali di-override).
 *     • hardBlock === false → dilewati (warning tetap dicatat di response, opsional).
 *
 * Override:
 *   caller yang boleh override = OWNER/ADMIN tenant, atau ProjectMember role
 *   MANAGER pada SEMUA project yang bermasalah. Wajib sertakan alasan minimal
 *   5 karakter.
 */
@Injectable()
export class BudgetGuardService {
  constructor(private readonly ctx: TenantContext) {}

  async check(
    tx: Prisma.TransactionClient,
    journal: JournalMeta,
    lines: LineInput[],
    opts?: { override?: boolean; alasan?: string; excludeJournalId?: string },
  ): Promise<{ violations: BudgetViolation[] }> {
    // Kelompokkan input lines per (projectId, accountId) → jumlah signed baru
    const projectLines = lines.filter(
      (l): l is LineInput & { projectId: string } => !!l.projectId,
    );
    if (projectLines.length === 0) return { violations: [] };

    const projectIds = Array.from(new Set(projectLines.map((l) => l.projectId)));
    const accountIds = Array.from(new Set(projectLines.map((l) => l.accountId)));

    const [accounts, budgets] = await Promise.all([
      tx.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, kode: true, nama: true, normalBalance: true },
      }),
      tx.budget.findMany({
        where: {
          projectId: { in: projectIds },
          accountId: { in: accountIds },
          periode: periodeOf(journal.tanggal),
        },
        include: {
          project: { select: { id: true, kode: true, nama: true } },
        },
      }),
    ]);
    if (budgets.length === 0) return { violations: [] };

    const acctById = new Map(accounts.map((a) => [a.id, a]));
    const startDate = startOfMonth(journal.tanggal);
    const endDate = endOfMonth(journal.tanggal);

    // Hitung signed(sum) baru per (projectId, accountId).
    const newByBucket = new Map<string, Decimal>(); // key: `${projectId}|${accountId}`
    for (const l of projectLines) {
      const acc = acctById.get(l.accountId);
      if (!acc) continue;
      const d = new Decimal(l.debit as string);
      const k = new Decimal(l.kredit as string);
      const signed = acc.normalBalance === NormalBalance.DEBIT ? d.minus(k) : k.minus(d);
      const key = `${l.projectId}|${l.accountId}`;
      newByBucket.set(key, (newByBucket.get(key) ?? new Decimal(0)).plus(signed));
    }

    const violations: BudgetViolation[] = [];

    for (const b of budgets) {
      const acc = acctById.get(b.accountId);
      if (!acc) continue;
      const key = `${b.projectId}|${b.accountId}`;
      const newDelta = newByBucket.get(key) ?? new Decimal(0);
      if (newDelta.lte(0)) continue; // tidak nambah spending

      // Sum posted lines di bucket sama dalam bulan yang sama.
      const agg = await tx.journalLine.aggregate({
        where: {
          projectId: b.projectId,
          accountId: b.accountId,
          journal: {
            status: JournalStatus.POSTED,
            tanggal: { gte: startDate, lte: endDate },
            ...(opts?.excludeJournalId ? { id: { not: opts.excludeJournalId } } : {}),
          },
        },
        _sum: { debit: true, kredit: true },
      });
      const sumD = new Decimal(agg._sum.debit ?? 0);
      const sumK = new Decimal(agg._sum.kredit ?? 0);
      const spent = acc.normalBalance === NormalBalance.DEBIT ? sumD.minus(sumK) : sumK.minus(sumD);
      const projected = spent.plus(newDelta);
      const limit = new Decimal(b.amount);
      if (projected.lte(limit)) continue;

      violations.push({
        projectId: b.projectId,
        projectKode: b.project.kode,
        projectNama: b.project.nama,
        accountId: b.accountId,
        accountKode: acc.kode,
        accountNama: acc.nama,
        periode: b.periode,
        budgetAmount: limit.toFixed(2),
        spentSoFar: spent.toFixed(2),
        newMutasi: newDelta.toFixed(2),
        projectedTotal: projected.toFixed(2),
        hardBlock: b.hardBlock,
      });
    }

    if (violations.length === 0) return { violations };

    const hardOnes = violations.filter((v) => v.hardBlock);
    if (hardOnes.length === 0) return { violations };

    if (opts?.override) {
      await this.assertOverrideAuthority(tx, hardOnes, opts.alasan);
      return { violations };
    }
    throw new BudgetExceededException(hardOnes);
  }

  private async assertOverrideAuthority(
    tx: Prisma.TransactionClient,
    violations: BudgetViolation[],
    alasan?: string,
  ): Promise<void> {
    if (!alasan || alasan.trim().length < 5) {
      throw new BadRequestException('Alasan override budget wajib diisi (minimal 5 huruf)');
    }
    const { role, userId } = this.ctx.require();
    if (role === 'OWNER' || role === 'ADMIN') return;

    const uniqueProjects = Array.from(new Set(violations.map((v) => v.projectId)));
    const memberships = await tx.projectMember.findMany({
      where: { userId, projectId: { in: uniqueProjects } },
      select: { projectId: true, role: true },
    });
    const managerOf = new Set(
      memberships
        .filter((m) => m.role === ProjectMemberRole.MANAGER)
        .map((m) => m.projectId),
    );
    for (const pid of uniqueProjects) {
      if (!managerOf.has(pid)) {
        throw new ForbiddenException(
          'Override budget hanya boleh OWNER/ADMIN tenant atau MANAGER project terkait',
        );
      }
    }
  }
}

function periodeOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
