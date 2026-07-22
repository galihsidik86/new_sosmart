import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { PostButton } from '@/components/PostButton';
import { LinkBuktiList } from '@/components/LinkBukti';
import { parseBudgetViolations, type PostResult } from '@/lib/budgetGuard';
import { runWithApprover } from '@/lib/stepUp';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canPostAccounting, canPostCashBank } from '@/lib/roles';
import { fmtPlain, fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, Card, StatusBadge, Button, buttonClass } from '@/components/ui';
import { ApprovalPanel } from '@/components/ApprovalPanel';

interface Detail {
  id: string;
  nomor: string | null;
  tanggal: string;
  tipe: 'RECEIPT' | 'PAYMENT' | 'TRANSFER';
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  akunKasBank: { kode: string; nama: string };
  cabang: { kode: string; nama: string };
  total: string;
  kontak: string | null;
  deskripsi: string | null;
  linkBukti: string | null;
  linkBuktiTambahan: string[];
  salesInvoiceId: string | null;
  purchaseInvoiceId: string | null;
  journalId: string | null;
  lines: Array<{
    no: number; nilai: string; deskripsi: string | null;
    account: { kode: string; nama: string };
    project: { id: string; kode: string; nama: string } | null;
  }>;
}

async function postCashBankAction(id: string): Promise<PostResult> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, error: 'Session expired, silakan login ulang.' };
  try {
    await apiFetch(`/cash-bank/${id}/post`, { method: 'POST', tenantId });
    revalidatePath(`/transaksi/kas-bank/${id}`);
    return { ok: true };
  } catch (e) {
    const v = parseBudgetViolations(e);
    if (v) return { ok: false, budgetViolations: v };
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal post bukti' };
  }
}

async function overrideCashBankPostAction(
  id: string,
  formData: FormData,
): Promise<{ error?: string } | void> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: 'Session expired, silakan login ulang.' };
  const session = await getSession();
  const overrideBudget = String(formData.get('overrideBudget') ?? 'false') === 'true';
  const alasan = String(formData.get('alasan') ?? '');
  if (overrideBudget && alasan.trim().length < 5) {
    return { error: 'Alasan override wajib minimal 5 huruf' };
  }
  // Untuk kas/bank tidak ada step-up "post biasa" (KASIR sudah boleh post),
  // jadi overrideAction hanya dipakai untuk override budget.
  const r = await runWithApprover({
    approverEmail: String(formData.get('approverEmail') ?? ''),
    approverPassword: String(formData.get('approverPassword') ?? ''),
    tenantId,
    requiredRoles: ['OWNER', 'ADMIN'],
    apiPath: `/cash-bank/${id}/post`,
    body: { overrideBudget: true, alasan },
    requestedByUserId: session?.user.id,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/transaksi/kas-bank/${id}`);
}
async function cancelAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/cash-bank/${id}/cancel`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan: String(formData.get('alasan') ?? '') }),
  });
  revalidatePath(`/transaksi/kas-bank/${id}`);
}
async function deleteAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/cash-bank/${id}`, { method: 'DELETE', tenantId });
  redirect('/transaksi/kas-bank');
}

export default async function KasBankDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const e = await apiFetch<Detail>(`/cash-bank/${id}`, { tenantId });
  const mayPost = canPostCashBank(s.role);
  const mayCancel = canPostAccounting(s.role);

  return (
    <>
      <PageContainer size="wide">
        <PageHeader
          title={e.nomor ?? '— Draft —'}
          subtitle={
            <>
              {fmtTanggal(e.tanggal)} · {e.tipe} · {e.akunKasBank.kode} {e.akunKasBank.nama}
              {e.journalId && (
                <span className="block text-xs text-tanah-500 mt-1">
                  Jurnal:{' '}
                  <Link href={`/pembukuan/jurnal/${e.journalId}`}
                    className="text-sogan-500 font-mono hover:underline">lihat</Link>
                </span>
              )}
              {(e.salesInvoiceId || e.purchaseInvoiceId) && (
                <span className="block text-xs text-tanah-500 mt-1">
                  Pelunasan untuk:{' '}
                  <Link
                    href={e.salesInvoiceId ? `/transaksi/penjualan/${e.salesInvoiceId}` : `/transaksi/pembelian/${e.purchaseInvoiceId}`}
                    className="text-sogan-500 hover:underline"
                  >
                    faktur terkait
                  </Link>
                </span>
              )}
              {(e.linkBukti || e.linkBuktiTambahan.length > 0) && (
                <span className="block text-xs mt-1">
                  <span className="text-tanah-500 mr-1">Bukti:</span>
                  <LinkBuktiList linkBukti={e.linkBukti} tambahan={e.linkBuktiTambahan} />
                </span>
              )}
            </>
          }
          actions={<StatusBadge status={e.status} />}
        />

        <Card padding="md" className="mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Kontak</div>
              <div className="text-tanah-700">{e.kontak ?? '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Cabang</div>
              <div className="text-tanah-700">{e.cabang.kode} — {e.cabang.nama}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Keterangan</div>
              <div className="text-tanah-700">{e.deskripsi ?? '—'}</div>
            </div>
            <div className="col-span-2 pt-3 border-t border-cream-200">
              <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Total</div>
              <div className="font-display text-3xl font-semibold text-wedel-900 mt-1 tabular-nums">
                {fmtRp(e.total)}
              </div>
            </div>
          </div>
        </Card>

        {e.lines.length > 0 && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-3 py-2 font-bold w-8">#</th>
                  <th className="px-3 py-2 font-bold">Akun</th>
                  <th className="px-3 py-2 font-bold">Project</th>
                  <th className="px-3 py-2 font-bold">Keterangan</th>
                  <th className="px-3 py-2 font-bold text-right">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {e.lines.map((l) => (
                  <tr key={l.no}>
                    <td className="px-3 py-1.5 text-xs text-tanah-500">{l.no}</td>
                    <td className="px-3 py-1.5 font-mono">
                      <span className="text-tanah-700">{l.account.kode}</span>{' '}
                      <span className="text-tanah-500">{l.account.nama}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {l.project ? (
                        <Link
                          href={`/master/project/${l.project.id}` as Route}
                          className="text-sogan-500 hover:underline font-mono"
                        >{l.project.kode}</Link>
                      ) : (
                        <span className="text-tanah-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-tanah-500 text-xs">{l.deskripsi ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtPlain(l.nilai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {e.status === 'DRAFT' && (
          <div className="mb-3">
            <ApprovalPanel docType="KAS_BANK" docId={e.id} path={`/transaksi/kas-bank/${e.id}`} />
          </div>
        )}

        <div className="flex items-center gap-3">
          {e.status === 'DRAFT' && (
            <>
              {mayPost ? (
                <PostButton
                  label="Post Bukti"
                  postAction={postCashBankAction.bind(null, e.id)}
                  overrideAction={overrideCashBankPostAction.bind(null, e.id)}
                />
              ) : (
                <span className="px-3 py-2 bg-emas-100 text-emas-700 text-xs rounded-lg border border-emas-300">
                  Posting bukti kas/bank perlu role Kasir+
                </span>
              )}
              <Link
                href={`/transaksi/kas-bank/${e.id}/edit` as Route}
                className={buttonClass('secondary')}
              >
                Edit Draft
              </Link>
              {mayPost && (
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <Button type="submit" variant="ghost">Hapus Draft</Button>
                </form>
              )}
            </>
          )}
          {e.status === 'POSTED' && mayCancel && (
            <form action={cancelAction} className="flex gap-2">
              <input type="hidden" name="id" value={e.id} />
              <input name="alasan" required minLength={5} placeholder="Alasan pembatalan…"
                className="px-3 py-2 bg-white border border-cream-300 rounded-md text-sm w-72" />
              <Button type="submit" variant="danger">
                Batalkan
              </Button>
            </form>
          )}
        </div>
      </PageContainer>
    </>
  );
}
