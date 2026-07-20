import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { PostButton } from '@/components/PostButton';
import { LinkBuktiList } from '@/components/LinkBukti';
import { parseBudgetViolations, type PostResult } from '@/lib/budgetGuard';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canPostAccounting } from '@/lib/roles';
import { runWithApprover } from '@/lib/stepUp';
import { fmtPlain, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, StatusBadge, Button, buttonClass, Input,
} from '@/components/ui';
import { ApprovalPanel } from '@/components/ApprovalPanel';

type Status = 'DRAFT' | 'POSTED' | 'REVERSED';

interface Line {
  no: number;
  debit: string;
  kredit: string;
  deskripsi: string | null;
  account: { kode: string; nama: string; normalBalance: 'DEBIT' | 'KREDIT' };
  project: { id: string; kode: string; nama: string } | null;
}
interface JurnalDetail {
  id: string;
  nomor: string | null;
  tanggal: string;
  deskripsi: string;
  linkBukti: string | null;
  linkBuktiTambahan: string[];
  sumber: string;
  sumberRef: string | null;
  status: Status;
  totalDebit: string;
  totalKredit: string;
  postedAt: string | null;
  postedBy: { id: string; email: string; nama: string } | null;
  postedRequestedBy: { id: string; email: string; nama: string } | null;
  reversedFrom: { id: string; nomor: string | null } | null;
  reversals: Array<{ id: string; nomor: string | null; status: Status }>;
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string; status: string };
  lines: Line[];
}

async function postJurnalAction(id: string): Promise<PostResult> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, error: 'Session expired, silakan login ulang.' };
  try {
    await apiFetch(`/journals/${id}/post`, { method: 'POST', tenantId });
    revalidatePath(`/pembukuan/jurnal/${id}`);
    return { ok: true };
  } catch (e) {
    const v = parseBudgetViolations(e);
    if (v) return { ok: false, budgetViolations: v };
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal post jurnal' };
  }
}

async function overridePostAction(
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
  const r = await runWithApprover({
    approverEmail: String(formData.get('approverEmail') ?? ''),
    approverPassword: String(formData.get('approverPassword') ?? ''),
    tenantId,
    requiredRoles: overrideBudget ? ['OWNER', 'ADMIN'] : ['OWNER', 'ADMIN', 'AKUNTAN'],
    apiPath: `/journals/${id}/post`,
    body: overrideBudget ? { overrideBudget: true, alasan } : undefined,
    requestedByUserId: session?.user.id,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/pembukuan/jurnal/${id}`);
}

async function deleteDraftAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/journals/${id}`, { method: 'DELETE', tenantId });
  redirect('/pembukuan/jurnal');
}

async function reverseAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  const alasan = String(formData.get('alasan') ?? '');
  await apiFetch(`/journals/${id}/reverse`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan }),
  });
  revalidatePath(`/pembukuan/jurnal/${id}`);
}

export default async function JurnalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const j = await apiFetch<JurnalDetail>(`/journals/${id}`, { tenantId });
  const mayPost = canPostAccounting(s.role);

  return (
    <>
      <PageContainer size="wide">
        <PageHeader
          title={j.nomor ?? '— Draft —'}
          subtitle={
            <>
              {j.deskripsi} · {fmtTanggal(j.tanggal)} · cabang {j.cabang.kode} ·
              periode {j.fiscalPeriod.label} ({j.fiscalPeriod.status})
            </>
          }
          actions={<StatusBadge status={j.status} size="md" />}
          className="mb-2"
        />

        {(j.linkBukti || j.linkBuktiTambahan.length > 0 || j.postedBy || j.reversedFrom || j.reversals.length > 0) && (
          <Card padding="sm" className="mb-6 space-y-1">
            {(j.linkBukti || j.linkBuktiTambahan.length > 0) && (
              <p className="text-xs">
                <span className="text-tanah-500 mr-1">Bukti:</span>
                <LinkBuktiList linkBukti={j.linkBukti} tambahan={j.linkBuktiTambahan} />
              </p>
            )}
            {j.postedBy && (
              <p className="text-xs text-tanah-500">
                Diposting oleh <span className="font-semibold text-tanah-700">{j.postedBy.nama}</span> ({j.postedBy.email})
                {j.postedRequestedBy && (
                  <> · atas permintaan <span className="font-semibold text-tanah-700">{j.postedRequestedBy.nama}</span> ({j.postedRequestedBy.email})</>
                )}
              </p>
            )}
            {j.reversedFrom && (
              <p className="text-xs text-tanah-500">
                Membalik:{' '}
                <Link
                  href={`/pembukuan/jurnal/${j.reversedFrom.id}`}
                  className="text-sogan-500 font-mono"
                >
                  {j.reversedFrom.nomor}
                </Link>
              </p>
            )}
            {j.reversals.length > 0 && (
              <p className="text-xs text-bata-700">
                Dibalik oleh:{' '}
                {j.reversals.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ', '}
                    <Link
                      href={`/pembukuan/jurnal/${r.id}`}
                      className="text-sogan-500 font-mono"
                    >
                      {r.nomor}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </Card>
        )}

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2.5 font-bold w-8">#</th>
                <th className="px-3 py-2.5 font-bold">Akun</th>
                <th className="px-3 py-2.5 font-bold">Project</th>
                <th className="px-3 py-2.5 font-bold">Keterangan</th>
                <th className="px-3 py-2.5 font-bold text-right w-40">Debit</th>
                <th className="px-3 py-2.5 font-bold text-right w-40">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {j.lines.map((l) => (
                <tr key={l.no}>
                  <td className="px-3 py-2 text-xs text-tanah-500 tabular-nums">{l.no}</td>
                  <td className="px-3 py-2 font-mono">
                    <span className="text-tanah-700">{l.account.kode}</span>{' '}
                    <span className="text-tanah-500">— {l.account.nama}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.project ? (
                      <Link
                        href={`/master/project/${l.project.id}` as Route}
                        className="text-sogan-500 hover:underline"
                      >
                        {l.project.kode}
                      </Link>
                    ) : (
                      <span className="text-tanah-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-tanah-500 text-xs">{l.deskripsi ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {Number(l.debit) > 0 ? fmtPlain(l.debit) : ''}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {Number(l.kredit) > 0 ? fmtPlain(l.kredit) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-cream-300 bg-cream-50 font-bold text-tanah-700">
                <td colSpan={4} className="px-3 py-2.5 text-right">TOTAL</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(j.totalDebit)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(j.totalKredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {j.status === 'DRAFT' && (
          <div className="mt-6">
            <ApprovalPanel docType="JURNAL" docId={j.id} path={`/pembukuan/jurnal/${j.id}`} />
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <a
            href={`/proxy/journals/${j.id}/print.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('soft-bata')}
          >
            Preview PDF
          </a>
          {j.status === 'DRAFT' && (
            <>
              <PostButton
                label={mayPost ? 'Post Jurnal' : 'Post (perlu approval Akuntan)'}
                requiresStepUpFirst={!mayPost}
                postAction={postJurnalAction.bind(null, j.id)}
                overrideAction={overridePostAction.bind(null, j.id)}
              />
              <Link
                href={`/pembukuan/jurnal/${j.id}/edit` as Route}
                className={buttonClass('secondary')}
              >
                Edit Draft
              </Link>
              <form action={deleteDraftAction}>
                <input type="hidden" name="id" value={j.id} />
                <Button type="submit" variant="ghost">Hapus Draft</Button>
              </form>
            </>
          )}
          {j.status === 'POSTED' && mayPost && (
            <form action={reverseAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={j.id} />
              <Input
                name="alasan" required minLength={5}
                placeholder="Alasan pembalik (≥5 huruf)"
                fullWidth={false} className="w-72"
              />
              <Button type="submit" variant="danger">Balik (Reverse)</Button>
            </form>
          )}
          {j.status === 'REVERSED' && (
            <div className="text-sm text-tanah-500">
              Jurnal ini sudah dibalik. Lihat jurnal pembalik di atas.
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
