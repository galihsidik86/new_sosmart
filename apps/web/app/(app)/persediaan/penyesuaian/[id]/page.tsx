import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { StepUpButton } from '@/components/StepUpButton';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canCancelPosted, canPostAccounting } from '@/lib/roles';
import { runWithApprover } from '@/lib/stepUp';
import { fmtPlain, fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, Button, buttonClass, StatusBadge } from '@/components/ui';

type Status = 'DRAFT' | 'POSTED' | 'CANCELLED' | 'PARTIAL' | 'PAID';

interface Detail {
  id: string;
  nomor: string | null;
  tanggal: string;
  alasan: string;
  status: Status;
  totalDeltaNilai: string;
  journalId: string | null;
  postedBy: { id: string; email: string; nama: string } | null;
  postedRequestedBy: { id: string; email: string; nama: string } | null;
  cancelledAt: string | null;
  cancelledBy: { id: string; email: string; nama: string } | null;
  cancelledRequestedBy: { id: string; email: string; nama: string } | null;
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
  const session = await getSession();
  const id = String(formData.get('id'));
  const r = await runWithApprover({
    approverEmail: String(formData.get('approverEmail') ?? ''),
    approverPassword: String(formData.get('approverPassword') ?? ''),
    tenantId,
    requiredRoles: ['OWNER', 'ADMIN', 'AKUNTAN'],
    apiPath: `/stok-adjustments/${id}/post`,
    requestedByUserId: session?.user.id,
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
async function cancelWithApproverAction(formData: FormData): Promise<{ error?: string } | void> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: 'Session expired, silakan login ulang.' };
  const session = await getSession();
  const id = String(formData.get('id'));
  const alasan = String(formData.get('alasan') ?? '');
  if (alasan.length < 5) return { error: 'Alasan pembatalan minimal 5 huruf.' };
  const r = await runWithApprover({
    approverEmail: String(formData.get('approverEmail') ?? ''),
    approverPassword: String(formData.get('approverPassword') ?? ''),
    tenantId,
    requiredRoles: ['OWNER', 'ADMIN'],
    apiPath: `/stok-adjustments/${id}/cancel`,
    body: { alasan },
    requestedByUserId: session?.user.id,
  });
  if (!r.ok) return { error: r.error };
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
      <PageContainer size="form">
        <PageHeader
          title={adj.nomor ?? '— Draft —'}
          actions={<StatusBadge status={adj.status} size="md" />}
          subtitle={
            <>
              {fmtTanggal(adj.tanggal)} · cabang {adj.cabang.kode} · periode {adj.fiscalPeriod.label}
              <span className="block text-tanah-700 mt-1 italic">"{adj.alasan}"</span>
              {adj.journalId && (
                <span className="block text-xs mt-1">
                  Jurnal:{' '}
                  <Link href={`/pembukuan/jurnal/${adj.journalId}`}
                    className="text-sogan-500 font-mono hover:underline">lihat</Link>
                </span>
              )}
              {adj.postedBy && (
                <span className="block text-xs mt-1">
                  Diposting oleh <span className="font-semibold text-tanah-700">{adj.postedBy.nama}</span> ({adj.postedBy.email})
                  {adj.postedRequestedBy && (
                    <> · atas permintaan <span className="font-semibold text-tanah-700">{adj.postedRequestedBy.nama}</span> ({adj.postedRequestedBy.email})</>
                  )}
                </span>
              )}
              {adj.cancelledBy && (
                <span className="block text-xs text-bata-700 mt-1">
                  Dibatalkan oleh <span className="font-semibold">{adj.cancelledBy.nama}</span> ({adj.cancelledBy.email})
                  {adj.cancelledRequestedBy && (
                    <> · atas permintaan <span className="font-semibold">{adj.cancelledRequestedBy.nama}</span> ({adj.cancelledRequestedBy.email})</>
                  )}
                </span>
              )}
            </>
          }
        />

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
                  <Button type="submit">
                    Post Opname (record stok + jurnal)
                  </Button>
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
                className={buttonClass('secondary')}
              >
                Edit Draft
              </Link>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={adj.id} />
                <Button type="submit" variant="secondary">
                  Hapus Draft
                </Button>
              </form>
            </>
          )}
          {adj.status === 'POSTED' && !mayCancel && s.role === 'AKUNTAN' && (
            <StepUpButton
              label="Batalkan (perlu approval Admin)"
              title="Persetujuan Owner / Admin"
              description="Pembatalan akan reverse jurnal & stok movement. Masukkan alasan dan kredensial owner/admin."
              variant="danger"
              action={cancelWithApproverAction}
              hiddenFields={{ id: adj.id }}
              reason={{ label: 'Alasan pembatalan', placeholder: 'minimal 5 huruf' }}
            />
          )}
          {adj.status === 'POSTED' && mayCancel && (
            <form action={cancelAction} className="flex gap-2">
              <input type="hidden" name="id" value={adj.id} />
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
