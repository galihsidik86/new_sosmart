export type Role = 'OWNER' | 'ADMIN' | 'AKUNTAN' | 'KASIR' | 'AUDITOR';

const POSTING_ROLES: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN'];
const POSTING_WITH_KASIR: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN', 'KASIR'];
const CANCEL_ROLES: Role[] = ['OWNER', 'ADMIN'];
const ADMIN_ROLES: Role[] = ['OWNER', 'ADMIN'];

function has(role: string | undefined, allowed: Role[]): boolean {
  return !!role && allowed.includes(role as Role);
}

/** Sales / Purchases / Journals / Payroll / Depresiasi posting — bukan KASIR. */
export const canPostAccounting = (role?: string) => has(role, POSTING_ROLES);

/** Kas/Bank posting — KASIR boleh. */
export const canPostCashBank = (role?: string) => has(role, POSTING_WITH_KASIR);

/** Cancel posted document — biasanya hanya OWNER/ADMIN. */
export const canCancelPosted = (role?: string) => has(role, CANCEL_ROLES);

/** Manajemen master setting (cabang, user). */
export const canAdmin = (role?: string) => has(role, ADMIN_ROLES);
