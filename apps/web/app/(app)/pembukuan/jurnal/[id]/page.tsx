import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { Topbar } from '@/components/Topbar';
import { StepUpButton } from '@/components/StepUpButton';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canPostAccounting } from '@/lib/roles';
import { runWithApprover } from '@/lib/stepUp';
import { fmtPlain, fmtTanggal } from '@/lib/format';

type Status = 'DRAFT' | 'POSTED' | 'REVERSED';

interface Line {
  no: number;
  debit: string;
  kredit: string;
  deskripsi: string | null;
  account: { kode: string; nama: string; normalBalance: 'DEBIT' | 'KREDIT' };
}
interface JurnalDetail {
  id: string;
  nomor: string | null;
  tanggal: string;
  deskripsi: string;
  sumber: string;
  sumberRef: string | null;
  status: Status;
  totalDebit: string;
  totalKredit: string;
  postedAt: string | null;
  reversedFrom: { id: string; nomor: string | null } | null;
  reversals: Array<{ id: string; nomor: string | null; status: Status }>;
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string; status: string };
  lines: Line[];
}

async function postAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/journals/${id}/post`, { method: 'POST', tenantId });
  revalidatePath(`/pembukuan/jurnal/${id}`);
}

async function postWithApproverAction(formData: FormData): Promise<{ error?: string } | void> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: 'Session expired, silakan login ulang.' };
  const id = String(formData.get('id'));
  const r = await runWithApprover({
    approverEmail: String(formData.get('approverEmail') ?? ''),
    approverPassword: String(formData.get('approverPassword') ?? ''),
    tenantId,
    requiredRoles: ['OWNER', 'ADMIN', 'AKUNTAN'],
    apiPath: `/journals/${id}/post`,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/pembukuan/jurnal/${id}`);
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

async function deleteDraftAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/journals/${id}`, { method: 'DELETE', tenantId });
  redirect('/pembukuan/jurnal');
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
      <Topbar
        breadcrumb={`Jurnal / ${j.nomor ?? 'Draft'}`}
        tenantNama={s.tenantNama!}
      />
      <div className="px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              {j.nomor ?? '— Draft —'}
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {j.deskripsi} · {fmtTanggal(j.tanggal)} · cabang {j.cabang.kode} ·
              periode {j.fiscalPeriod.label} ({j.fiscalPeriod.status})
            </p>
            {j.reversedFrom && (
              <p className="text-xs text-tanah-500 mt-1">
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
              <p className="text-xs text-bata-700 mt-1">
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
          </div>
          <StatusBadge status={j.status} />
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2.5 font-bold w-8">#</th>
                <th className="px-3 py-2.5 font-bold">Akun</th>
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
                  <td className="px-3 py-2 text-tanah-500 text-xs">{l.deskripsi ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {Number(l.debit) > 0 ? fmtPlain(l.debit) : ''}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {Number(l.kredit) > 0 ? fmtPlain(l.kredit) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-cream-300 bg-cream-50 font-bold text-tanah-700">
                <td colSpan={3} className="px-3 py-2.5 text-right">TOTAL</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPlain(j.totalDebit)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPlain(j.totalKredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <a
            href={`/proxy/journals/${j.id}/print.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-bata-100 hover:bg-bata-200 text-bata-700 font-semibold rounded-lg text-sm border border-bata-300"
          >
            Preview PDF
          </a>
          {j.status === 'DRAFT' && (
            <>
              {mayPost ? (
                <form action={postAction}>
                  <input type="hidden" name="id" value={j.id} />
                  <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                    Post Jurnal
                  </button>
                </form>
              ) : (
                <StepUpButton
                  label="Post (perlu approval Akuntan)"
                  title="Persetujuan Akuntan / Admin"
                  description="Posting jurnal akan mengalokasi nomor permanen dan tidak bisa diedit lagi. Masukkan kredensial akuntan/admin untuk melanjutkan."
                  action={postWithApproverAction}
                  hiddenFields={{ id: j.id }}
                />
              )}
              <Link
                href={`/pembukuan/jurnal/${j.id}/edit` as Route}
                className="px-4 py-2 bg-white hover:bg-cream-50 text-tanah-700 font-semibold rounded-lg text-sm border border-cream-300"
              >
                Edit Draft
              </Link>
              <form action={deleteDraftAction}>
                <input type="hidden" name="id" value={j.id} />
                <button className="px-4 py-2 bg-cream-200 hover:bg-cream-300 text-tanah-700 font-semibold rounded-lg text-sm border border-cream-400">
                  Hapus Draft
                </button>
              </form>
            </>
          )}
          {j.status === 'POSTED' && mayPost && (
            <form action={reverseAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={j.id} />
              <input
                name="alasan" required minLength={5}
                placeholder="Alasan pembalik (≥5 huruf)"
                className="px-3 py-2 bg-white border border-cream-300 rounded-md text-sm w-72"
              />
              <button className="px-4 py-2 bg-bata-500 hover:bg-bata-700 text-cream-50 font-semibold rounded-lg text-sm">
                Balik (Reverse)
              </button>
            </form>
          )}
          {j.status === 'REVERSED' && (
            <div className="text-sm text-tanah-500">
              Jurnal ini sudah dibalik. Lihat jurnal pembalik di atas.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map = {
    DRAFT: 'bg-emas-100 text-emas-700',
    POSTED: 'bg-padi-100 text-padi-700',
    REVERSED: 'bg-cream-200 text-tanah-500 line-through',
  }[status];
  return (
    <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${map}`}>
      {status}
    </span>
  );
}
