import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId } from '@/lib/session';
import { fmtRp } from '@/lib/format';
import { Button, Badge } from '@/components/ui';

type DocType = 'PENJUALAN' | 'PEMBELIAN' | 'KAS_BANK' | 'JURNAL';

interface DocCtx {
  required: boolean;
  posted: boolean;
  amount: string;
  steps: string[];
  request: null | {
    id: string;
    status: 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK';
    currentStep: number;
    totalSteps: number;
    stepRoles: string[];
    actions: Array<{ urutan: number; role: string; action: 'SETUJU' | 'TOLAK'; catatan: string | null; actedAt: string }>;
  };
}

/**
 * Panel approval di halaman dokumen. Tidak merender apa-apa kalau dokumen tidak
 * butuh approval (di bawah ambang / tidak ada aturan) atau sudah diposting.
 */
export async function ApprovalPanel({
  docType, docId, path,
}: {
  docType: DocType;
  docId: string;
  /** Path halaman ini, untuk revalidate setelah aksi. */
  path: string;
}) {
  const tenantId = await getActiveTenantId();
  if (!tenantId) return null;

  let ctx: DocCtx;
  try {
    ctx = await apiFetch<DocCtx>(`/approval/doc?docType=${docType}&docId=${docId}`, { tenantId });
  } catch {
    return null;
  }
  if (!ctx.required || ctx.posted) return null;

  async function submit() {
    'use server';
    const t = await getActiveTenantId();
    if (!t) return;
    await apiFetch('/approval/submit', {
      method: 'POST', tenantId: t,
      body: JSON.stringify({ docType, docId }),
    });
    revalidatePath(path);
  }

  const req = ctx.request;
  const chain = ctx.steps.join(' → ');

  return (
    <div className="rounded-xl border border-emas-300 bg-emas-50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-tanah-700">
          <b>Approval berjenjang diperlukan</b>{' '}
          <span className="text-tanah-500">(nilai {fmtRp(ctx.amount)} ≥ ambang aturan)</span>
          <div className="text-xs text-tanah-500 mt-0.5">Rantai persetujuan: {chain}</div>
        </div>
        {req?.status === 'MENUNGGU' && (
          <Badge variant="brand">
            Menunggu tingkat {req.currentStep}/{req.totalSteps} · {req.stepRoles[req.currentStep - 1]}
          </Badge>
        )}
        {req?.status === 'DISETUJUI' && <Badge variant="success">Disetujui — siap diposting</Badge>}
        {req?.status === 'DITOLAK' && <Badge variant="danger">Ditolak</Badge>}
        {(!req || req.status === 'DITOLAK') && (
          <form action={submit}>
            <Button type="submit" size="sm" variant="soft-emas">
              {req?.status === 'DITOLAK' ? 'Ajukan ulang' : 'Ajukan Approval'}
            </Button>
          </form>
        )}
      </div>
      {req && req.actions.length > 0 && (
        <ul className="text-xs text-tanah-600 border-t border-emas-200 pt-2 space-y-0.5">
          {req.actions.map((a) => (
            <li key={a.urutan}>
              Tingkat {a.urutan} ({a.role}):{' '}
              <span className={a.action === 'SETUJU' ? 'text-padi-700 font-semibold' : 'text-bata-700 font-semibold'}>
                {a.action === 'SETUJU' ? 'Disetujui' : 'Ditolak'}
              </span>
              {a.catatan ? ` — ${a.catatan}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
