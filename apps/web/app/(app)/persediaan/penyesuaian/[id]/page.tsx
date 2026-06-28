import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { Topbar } from '@/components/Topbar';
import { StepUpButton } from '@/components/StepUpButton';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canCancelPosted, canPostAccounting } from '@/lib/roles';
import { runWithApprover } from '@/lib/stepUp';
import { fmtPlain, fmtRp, fmtTanggal } from '@/lib/format';

type Status = 'DRAFT' | 'POSTED' | 'CANCELLED' | 'PARTIAL' | 'PAID';

interface Detail {
  id: string;
  nomor: string | null;
  tanggal: string;
  alasan: string;
  status: Status;
  totalDeltaNilai: string;
  journalId: string | null;
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  lines: Array<{
    no: number;
    qtySaatIni: string;
    qtyFisik: string;
    delta: string;
    hargaPokok: string;
    nilaiDelta: string;
    keterangan: string | null;
    item: { kode: string; nama: string; satuan: string };
  }>;
}

async function postAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/stok-adjustments/${id}/post`, { method: 'POST', tenantId });
  revalidatePath(`/persediaan/penyesuaian/${id}`);
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
    apiPath: `/stok-adjustments/${id}/post`,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/persediaan/penyesuaian/${id}`);
}
async function cancelAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/stok-adjustments/${id}/cancel`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan: String(formData.get('alasan') ?? '') }),
  });
  revalidatePath(`/persediaan/penyesuaian/${id}`);
}
async function deleteAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/stok-adjustments/${id}`, { method: 'DELETE', tenantId });
  redirect('/persediaan/penyesuaian');
}

export default async function PenyesuaianDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const adj = await apiFetch<Detail>(`/stok-adjustments/${id}`, { tenantId });
  const mayPost = canPostAccounting(s.role);
  const mayCancel = canCancelPosted(s.role);

  return (
    <>
      <Topbar breadcrumb={`Penyesuaian / ${adj.nomor ?? 'Draft'}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              {adj.nomor ?? '— Draft —'}
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {fmtTanggal(adj.tanggal)} · cabang {adj.cabang.kode} · periode {adj.fiscalPeriod.label}
            </p>
            <p className="text-sm text-tanah-700 mt-1 italic">"{adj.alasan}"</p>
            {adj.journalId && (
              <p className="text-xs text-tanah-500 mt-1">
                Jurnal:{' '}
                <Link href={`/pembukuan/jurnal/${adj.journalId}`}
                  className="text-sogan-500 font-mono hover:underline">lihat</Link>
              </p>
            )}
          </div>
          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${
            adj.status === 'POSTED' ? 'bg-padi-100 text-padi-700' :
            adj.status === 'DRAFT' ? 'bg-emas-100 text-emas-700' :
            'bg-cream-200 text-tanah-500'
          }`}>{adj.status}</span>
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2 font-bold w-8">#</th>
                <th className="px-3 py-2 font-bold">Item</th>
                <th className="px-3 py-2 font-bold text-right">Pencatatan</th>
                <th className="px-3 py-2 font-bold text-right">Fisik</th>
                <th className="px-3 py-2 font-bold text-right">Δ Qty</th>
                <th className="px-3 py-2 font-bold text-right">Harga Pokok</th>
                <th className="px-3 py-2 font-bold text-right">Δ Nilai</th>
                <th className="px-3 py-2 font-bold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {adj.lines.map((l) => {
                const dQty = Number(l.delta);
                const dNilai = Number(l.nilaiDelta);
                return (
                  <tr key={l.no}>
                    <td className="px-3 py-1.5 text-xs text-tanah-500">{l.no}</td>
                    <td className="px-3 py-1.5">
                      <div className="font-semibold text-tanah-700">{l.item.nama}</div>
                      <div className="text-xs text-tanah-500 font-mono">{l.item.kode}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs text-tanah-500">
                      {fmtPlain(Number(l.qtySaatIni))} {l.item.satuan}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                      {fmtPlain(Number(l.qtyFisik))} {l.item.satuan}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${dQty < 0 ? 'text-bata-700' : dQty > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>
                      {dQty > 0 && '+'}{fmtPlain(dQty)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs text-tanah-500">
                      {fmtRp(l.hargaPokok)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${dNilai < 0 ? 'text-bata-700' : dNilai > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>
                      {dNilai > 0 && '+'}{fmtRp(dNilai)}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-tanah-500">{l.keterangan ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-cream-50 font-bold">
              <tr><td colSpan={6} className="px-3 py-2 text-right text-tanah-700">TOTAL Δ NILAI</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums text-base ${Number(adj.totalDeltaNilai) < 0 ? 'text-bata-700' : 'text-padi-700'}`} colSpan={2}>
                  {Number(adj.totalDeltaNilai) > 0 && '+'}{fmtRp(adj.totalDeltaNilai)}
                </td></tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-center gap-3">
          {adj.status === 'DRAFT' && (
            <>
              {mayPost ? (
                <form action={postAction}>
                  <input type="hidden" name="id" value={adj.id} />
                  <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                    Post Opname (record stok + jurnal)
                  </button>
                </form>
              ) : (
                <StepUpButton
                  label="Post (perlu approval Akuntan)"
                  title="Persetujuan Akuntan / Admin"
                  description="Posting opname akan record stok movement & terbit jurnal selisih. Masukkan kredensial akuntan/admin untuk melanjutkan."
                  action={postWithApproverAction}
                  hiddenFields={{ id: adj.id }}
                />
              )}
              <Link
                href={`/persediaan/penyesuaian/${adj.id}/edit` as Route}
                className="px-4 py-2 bg-white hover:bg-cream-50 text-tanah-700 font-semibold rounded-lg text-sm border border-cream-300"
              >
                Edit Draft
              </Link>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={adj.id} />
                <button className="px-4 py-2 bg-cream-200 hover:bg-cream-300 text-tanah-700 font-semibold rounded-lg text-sm border border-cream-400">
                  Hapus Draft
                </button>
              </form>
            </>
          )}
          {adj.status === 'POSTED' && mayCancel && (
            <form action={cancelAction} className="flex gap-2">
              <input type="hidden" name="id" value={adj.id} />
              <input name="alasan" required minLength={5} placeholder="Alasan pembatalan…"
                className="px-3 py-2 bg-white border border-cream-300 rounded-md text-sm w-72" />
              <button className="px-4 py-2 bg-bata-500 hover:bg-bata-700 text-cream-50 font-semibold rounded-lg text-sm">
                Batalkan
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
