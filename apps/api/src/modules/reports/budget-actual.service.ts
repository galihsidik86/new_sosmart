import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { JournalStatus, NormalBalance, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

export type BudgetStatus = 'OK' | 'WARNING' | 'EXCEEDED';

export interface BudgetActualRow {
  budgetId: string;
  project: { id: string; kode: string; nama: string };
  account: { id: string; kode: string; nama: string; normalBalance: NormalBalance };
  periode: string;
  budget: string;
  actual: string;
  variance: string;          // budget − actual (positif = sisa; negatif = over)
  utilisasiPersen: string;   // actual / budget × 100 (2 desimal)
  status: BudgetStatus;
  hardBlock: boolean;
  catatan: string | null;
}

export interface BudgetActualProjectGroup {
  project: { id: string; kode: string; nama: string };
  rows: BudgetActualRow[];
  totalBudget: string;
  totalActual: string;
  totalVariance: string;
}

export interface BudgetActualResponse {
  periode: string;
  startDate: Date;
  endDate: Date;
  projects: BudgetActualProjectGroup[];
  grandTotal: { budget: string; actual: string; variance: string };
}

/**
 * Laporan Budget vs Actual per (Project × Akun × Bulan).
 *
 * Actual = sum signed mutasi POSTED journal_lines untuk (projectId, accountId)
 * dalam bulan `periode`. Signed = saldo normal positif:
 *   DEBIT-normal (beban/aset) → debit − kredit
 *   KREDIT-normal (pendapatan/liabilitas) → kredit − debit
 *
 * Status:
 *   OK       → utilisasi ≤ 80%
 *   WARNING  → 80% < utilisasi ≤ 100%
 *   EXCEEDED → utilisasi > 100%
 */
@Injectable()
export class BudgetActualService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async build(opts: {
    periode: string; // YYYY-MM
    projectId?: string;
    cabangId?: string;
  }): Promise<BudgetActualResponse> {
    if (!/^\d{4}-\d{2}$/.test(opts.periode)) {
      throw new BadRequestException('Periode harus format YYYY-MM');
    }
    const [y, m] = opts.periode.split('-').map(Number);
    const startDate = new Date(Date.UTC(y, m - 1, 1));
    const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    if (opts.cabangId) this.cabangScope.assertAccess(opts.cabangId);
    const cabangScope = opts.cabangId
      ? { cabangId: opts.cabangId }
      : (() => {
          const scope = this.cabangScope.cabangIdsForWhere();
          return scope ? { cabangId: { in: scope } } : {};
        })();

    return this.tenancy.run(async (tx) => {
      const budgets = await tx.budget.findMany({
        where: {
          periode: opts.periode,
          ...(opts.projectId ? { projectId: opts.projectId } : {}),
        },
        include: {
          project: { select: { id: true, kode: true, nama: true } },
          account: {
            select: { id: true, kode: true, nama: true, normalBalance: true },
          },
        },
        orderBy: [{ project: { kode: 'asc' } }, { account: { kode: 'asc' } }],
      });

      if (budgets.length === 0) {
        return {
          periode: opts.periode,
          startDate,
          endDate,
          projects: [],
          grandTotal: { budget: '0.00', actual: '0.00', variance: '0.00' },
        };
      }

      // Kumpulkan actual per (projectId, accountId) via satu groupBy.
      const projectIds = Array.from(new Set(budgets.map((b) => b.projectId)));
      const accountIds = Array.from(new Set(budgets.map((b) => b.accountId)));
      const actualLines = await tx.journalLine.groupBy({
        by: ['projectId', 'accountId'],
        where: {
          projectId: { in: projectIds },
          accountId: { in: accountIds },
          journal: {
            status: JournalStatus.POSTED,
            tanggal: { gte: startDate, lte: endDate },
            ...cabangScope,
          },
        },
        _sum: { debit: true, kredit: true },
      });
      const actualByKey = new Map<
        string,
        { debit: Decimal; kredit: Decimal }
      >();
      for (const r of actualLines) {
        if (!r.projectId) continue;
        actualByKey.set(`${r.projectId}|${r.accountId}`, {
          debit: new Decimal(r._sum.debit ?? 0),
          kredit: new Decimal(r._sum.kredit ?? 0),
        });
      }

      // Susun row + group by project.
      const groups = new Map<string, BudgetActualProjectGroup>();
      let grandBudget = new Decimal(0);
      let grandActual = new Decimal(0);

      for (const b of budgets) {
        const key = `${b.projectId}|${b.accountId}`;
        const agg = actualByKey.get(key);
        const budget = new Decimal(b.amount);
        const actual = agg
          ? b.account.normalBalance === NormalBalance.DEBIT
            ? agg.debit.minus(agg.kredit)
            : agg.kredit.minus(agg.debit)
          : new Decimal(0);
        const variance = budget.minus(actual);
        const utilisasi = budget.gt(0)
          ? actual.div(budget).mul(100)
          : new Decimal(0);
        const status: BudgetStatus = utilisasi.gt(100)
          ? 'EXCEEDED'
          : utilisasi.gt(80)
            ? 'WARNING'
            : 'OK';

        const row: BudgetActualRow = {
          budgetId: b.id,
          project: b.project,
          account: b.account,
          periode: b.periode,
          budget: budget.toFixed(2),
          actual: actual.toFixed(2),
          variance: variance.toFixed(2),
          utilisasiPersen: utilisasi.toFixed(2),
          status,
          hardBlock: b.hardBlock,
          catatan: b.catatan,
        };

        let g = groups.get(b.projectId);
        if (!g) {
          g = {
            project: b.project,
            rows: [],
            totalBudget: '0.00',
            totalActual: '0.00',
            totalVariance: '0.00',
          };
          groups.set(b.projectId, g);
        }
        g.rows.push(row);
        grandBudget = grandBudget.plus(budget);
        grandActual = grandActual.plus(actual);
      }

      // Total per group.
      for (const g of groups.values()) {
        const tb = g.rows.reduce((a, r) => a.plus(r.budget), new Decimal(0));
        const ta = g.rows.reduce((a, r) => a.plus(r.actual), new Decimal(0));
        g.totalBudget = tb.toFixed(2);
        g.totalActual = ta.toFixed(2);
        g.totalVariance = tb.minus(ta).toFixed(2);
      }

      return {
        periode: opts.periode,
        startDate,
        endDate,
        projects: Array.from(groups.values()),
        grandTotal: {
          budget: grandBudget.toFixed(2),
          actual: grandActual.toFixed(2),
          variance: grandBudget.minus(grandActual).toFixed(2),
        },
      };
    });
  }
}
