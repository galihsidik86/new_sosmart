import { apiLogin } from './api';
import type { Role } from './roles';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface StepUpOpts {
  approverEmail: string;
  approverPassword: string;
  tenantId: string;
  /** Role yang diharapkan dimiliki approver dalam tenant ini. */
  requiredRoles: Role[];
  /** Path API yang akan dieksekusi pakai token approver, mis. `/sales-invoices/{id}/post`. */
  apiPath: string;
  method?: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** ID user yang sebenarnya meminta action (kasir). API tulis ke kolom postedRequestedById untuk audit. */
  requestedByUserId?: string;
}

/**
 * Validasi kredensial approver dan eksekusi action API memakai token approver.
 *
 * Catatan audit: action akan tercatat atas nama approver di DB
 * (createdBy, dibuatOleh, dll.) karena memakai JWT approver.
 * Aktor sesungguhnya (kasir) tetap login dengan sesinya sendiri.
 */
export async function runWithApprover<T>(opts: StepUpOpts): Promise<
  | { ok: true; data: T }
  | { ok: false; error: string }
> {
  let approver;
  try {
    approver = await apiLogin(opts.approverEmail, opts.approverPassword);
  } catch {
    return { ok: false, error: 'Email atau password approver salah' };
  }
  const membership = approver.memberships.find((m) => m.tenantId === opts.tenantId);
  if (!membership) {
    return { ok: false, error: 'Approver bukan anggota tenant ini' };
  }
  if (!opts.requiredRoles.includes(membership.role as Role)) {
    return {
      ok: false,
      error: `Role approver harus salah satu: ${opts.requiredRoles.join(', ')}`,
    };
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${approver.accessToken}`,
    'x-tenant-id': opts.tenantId,
  };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.requestedByUserId) headers['x-requested-by-user-id'] = opts.requestedByUserId;

  const res = await fetch(`${API_URL}/api/v1${opts.apiPath}`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Gagal: ${text}` };
  }
  const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  return { ok: true, data };
}
