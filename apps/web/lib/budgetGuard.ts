export interface BudgetViolation {
  projectId: string;
  projectKode: string;
  projectNama: string;
  accountId: string;
  accountKode: string;
  accountNama: string;
  periode: string;
  budgetAmount: string;
  spentSoFar: string;
  newMutasi: string;
  projectedTotal: string;
  hardBlock: boolean;
}

export type PostResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; budgetViolations: BudgetViolation[] };

/**
 * Coba parse response body `apiFetch` yang lempar Error("API 409: {...}")
 * — kalau match BudgetExceeded, return violations. Kalau bukan, null.
 */
export function parseBudgetViolations(err: unknown): BudgetViolation[] | null {
  if (!(err instanceof Error)) return null;
  const m = err.message.match(/^API (\d+): (.+)$/s);
  if (!m || m[1] !== '409') return null;
  try {
    const body = JSON.parse(m[2]);
    if (body?.error === 'BudgetExceeded' && Array.isArray(body.violations)) {
      return body.violations as BudgetViolation[];
    }
  } catch {
    // fall through
  }
  return null;
}
