import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { StepUpButton } from '@/components/StepUpButton';
import { PostButton } from '@/components/PostButton';
import { LinkBukti } from '@/components/LinkBukti';
import { parseBudgetViolations, type PostResult } from '@/lib/budgetGuard';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canCancelPosted, canPostAccounting } from '@/lib/roles';
import { runWithApprover } from '@/lib/stepUp';
import { fmtPlain, fmtRp, fmtTanggal, fmtNpwp } from '@/lib/format';
import { PageContainer, PageHeader, Card, StatusBadge, Button, buttonClass } from '@/components/ui';
import { ApprovalPanel } from '@/components/ApprovalPanel';

type Status = 'DRAFT' | 'POSTED' | 'PARTIAL' | 'PAID' | 'CANCELLED';

interface Detail {
  id: string;
  nomor: string | null; nomorVendor: string | null;
  tanggal: string; jatuhTempo: string;
  termin: 'TUNAI' | 'KREDIT';
  status: Status;
  deskripsi: string | null;
  linkBukti: string | null;
  vendor: { kode: string; nama: string; npwp: string | null; isPkp: boolean };
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  akunAp: { kode: string; nama: string };
  totalDpp: string; totalPpn: string; totalPph23: string;
  totalDiskon: string; totalNetto: string; totalDibayar: string;
  journalId: string | null;
  postedBy: { id: string; email: string; nama: string } | null;
  postedRequestedBy: { id: string; email: string; nama: string } | null;
  cancelledAt: string | null;
  cancelledBy: { id: string; email: string; nama: string } | null;
  cancelledRequestedBy: { id: string; email: string; nama: string } | null;
  lines: Array<{
    no: number; deskripsi: string; qty: string; satuan: string;
    hargaSatuan: string; diskonPersen: string; klasifikasiPpn: string; isJasa: boolean;
    dpp: string; ppn: string; pph23: string;
    item: { kode: string; nama: string } | null;
    akunDebit: { kode: string; nama: string };
    project: { id: string; kode: string; nama: string } | null;
  }>;
}

async function postPurchaseAction(id: string): Promise<PostResult> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, error: 'Session expired, silakan login ulang.' };
  try {
    await apiFetch(`/purchase-invoices/${id}/post`, { method: 'POST', tenantId });
    revalidatePath(`/transaksi/pembelian/${id}`);
    return { ok: true };
  } catch (e) {
    const v = parseBudgetViolations(e);
    if (v) return { ok: false, budgetViolations: v };
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal post tagihan' };
  }
}

async function overridePurchasePostAction(
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
    apiPath: `/purchase-invoices/${id}/post`,
    body: overrideBudget ? { overrideBudget: true, alasan } : undefined,
    requestedByUserId: session?.user.id,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/transaksi/pembelian/${id}`);
}
async function cancelAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/purchase-invoices/${id}/cancel`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan: String(formData.get('alasan') ?? '') }),
  });
  revalidatePath(`/transaksi/pembelian/${id}`);
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
    apiPath: `/purchase-invoices/${id}/cancel`,
    body: { alasan },
    requestedByUserId: session?.user.id,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/transaksi/pembelian/${id}`);
}
async function deleteAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/purchase-invoices/${id}`, { method: 'DELETE', tenantId });
  redirect('/transaksi/pembelian');
}

export default async function PembelianDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const inv = await apiFetch<Detail>(`/purchase-invoices/${id}`, { tenantId });
  const sisa = Number(inv.totalNetto) - Number(inv.totalDibayar);
  const mayPost = canPostAccounting(s.role);
  const mayCancel = canCancelPosted(s.role);

  return (
    <>
      <PageContainer size="form">
        <PageHeader
          title={inv.nomor ?? '— Draft —'}
          subtitle={
            <>
              {fmtTanggal(inv.tanggal)} · jatuh tempo {fmtTanggal(inv.jatuhTempo)} ·
              cabang {inv.cabang.kode} · termin {inv.termin}
              {inv.nomorVendor && <span> · faktur vendor {inv.nomorVendor}</span>}
              {inv.journalId && (
                <span className="block text-xs text-tanah-500 mt-1">
                  Jurnal:{' '}
                  <Link href={`/pembukuan/jurnal/${inv.journalId}`}
                    className="text-sogan-500 font-mono hover:underline">lihat</Link>
                </span>
              )}
              {inv.linkBukti && (
                <span className="block text-xs mt-1">
                  <span className="text-tanah-500 mr-1">Bukti:</span>
                  <LinkBukti url={inv.linkBukti} variant="full" />
                </span>
              )}
              {inv.postedBy && (
                <span className="block text-xs text-tanah-500 mt-1">
                  Diposting oleh <span className="font-semibold text-tanah-700">{inv.postedBy.nama}</span> ({inv.postedBy.email})
                  {inv.postedRequestedBy && (
                    <> · atas permintaan <span className="font-semibold text-tanah-700">{inv.postedRequestedBy.nama}</span> ({inv.postedRequestedBy.email})</>
                  )}
                </span>
              )}
              {inv.cancelledBy && (
                <span className="block text-xs text-bata-700 mt-1">
                  Dibatalkan oleh <span className="font-semibold">{inv.cancelledBy.nama}</span> ({inv.cancelledBy.email})
                  {inv.cancelledRequestedBy && (
                    <> · atas permintaan <span className="font-semibold">{inv.cancelledRequestedBy.nama}</span> ({inv.cancelledRequestedBy.email})</>
                  )}
                </span>
              )}
            </>
          }
          actions={<StatusBadge status={inv.status} />}
        />

        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card padding="sm">
            <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Vendor</div>
            <div className="font-semibold text-tanah-700 mt-1">{inv.vendor.nama}</div>
            <div className="text-xs text-tanah-500 font-mono">{inv.vendor.kode}</div>
            <div className="text-xs text-tanah-500 mt-1">
              NPWP {fmtNpwp(inv.vendor.npwp)} {inv.vendor.isPkp && <span className="text-padi-700 font-semibold ml-1">PKP</span>}
            </div>
          </Card>
          <Card padding="sm">
            <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Akun AP</div>
            <div className="font-semibold text-tanah-700 font-mono mt-1">{inv.akunAp.kode}</div>
            <div className="text-xs text-tanah-500">{inv.akunAp.nama}</div>
            <div className="text-xs text-tanah-500 mt-2">Periode: {inv.fiscalPeriod.label}</div>
          </Card>
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2 font-bold w-8">#</th>
                <th className="px-3 py-2 font-bold">Deskripsi</th>
                <th className="px-3 py-2 font-bold text-right">Qty</th>
                <th className="px-3 py-2 font-bold text-right">Harga</th>
                <th className="px-3 py-2 font-bold">Klasifikasi</th>
                <th className="px-3 py-2 font-bold text-right">DPP</th>
                <th className="px-3 py-2 font-bold text-right">PPN</th>
                <th className="px-3 py-2 font-bold text-right">PPh 23</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {inv.lines.map((l) => (
                <tr key={l.no}>
                  <td className="px-3 py-1.5 text-xs text-tanah-500">{l.no}</td>
                  <td className="px-3 py-1.5">
                    <div className="text-tanah-700">{l.deskripsi}</div>
                    <div className="text-xs text-tanah-500 font-mono">
                      {l.item?.kode ?? 'manual'} · {l.akunDebit.kode}
                      {l.project && (
                        <> · <Link
                          href={`/master/project/${l.project.id}` as Route}
                          className="text-sogan-500 hover:underline"
                        >{l.project.kode}</Link></>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs">
                    {Number(l.qty).toLocaleString('id-ID')} {l.satuan}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtPlain(l.hargaSatuan)}</td>
                  <td className="px-3 py-1.5 text-xs text-tanah-500">
                    {l.klasifikasiPpn}
                    {l.isJasa && <span className="ml-1 text-emas-700 text-[10px] uppercase">jasa</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtPlain(l.dpp)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{Number(l.ppn) > 0 ? fmtPlain(l.ppn) : '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-bata-700">
                    {Number(l.pph23) > 0 ? fmtPlain(l.pph23) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-cream-50 font-bold text-tanah-700">
              <tr><td colSpan={6} className="px-3 py-1.5 text-right">Total DPP</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums" colSpan={2}>{fmtRp(inv.totalDpp)}</td></tr>
              <tr><td colSpan={6} className="px-3 py-1.5 text-right">PPN Masukan</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums" colSpan={2}>{fmtRp(inv.totalPpn)}</td></tr>
              <tr><td colSpan={6} className="px-3 py-1.5 text-right text-bata-700">(–) PPh 23 dipotong</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-bata-700" colSpan={2}>{fmtRp(inv.totalPph23)}</td></tr>
              <tr className="border-t-2 border-cream-300">
                <td colSpan={6} className="px-3 py-2 text-right text-base">YANG DIBAYAR KE VENDOR</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-base" colSpan={2}>{fmtRp(inv.totalNetto)}</td>
              </tr>
              {sisa > 0 && inv.status !== 'CANCELLED' && (
                <tr><td colSpan={6} className="px-3 py-1.5 text-right text-bata-700">Sisa utang</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-bata-700" colSpan={2}>{fmtRp(sisa)}</td></tr>
              )}
            </tfoot>
          </table>
        </div>

        {inv.status === 'DRAFT' && (
          <div className="mb-3">
            <ApprovalPanel docType="PEMBELIAN" docId={inv.id} path={`/transaksi/pembelian/${inv.id}`} />
          </div>
        )}

        <div className="flex items-center gap-3">
          <a
            href={`/proxy/purchase-invoices/${inv.id}/print.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('soft-bata')}
          >
            Preview PDF
          </a>
          {inv.status === 'DRAFT' && (
            <>
              <PostButton
                label={mayPost ? 'Post Tagihan' : 'Post (perlu approval Akuntan)'}
                requiresStepUpFirst={!mayPost}
                postAction={postPurchaseAction.bind(null, inv.id)}
                overrideAction={overridePurchasePostAction.bind(null, inv.id)}
              />
              <Link
                href={`/transaksi/pembelian/${inv.id}/edit` as Route}
                className={buttonClass('secondary')}
              >
                Edit Draft
              </Link>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={inv.id} />
                <Button type="submit" variant="secondary">
                  Hapus Draft
                </Button>
              </form>
            </>
          )}
          {(inv.status === 'POSTED' || inv.status === 'PARTIAL') && !mayCancel && s.role === 'AKUNTAN' && (
            <StepUpButton
              label="Batalkan (perlu approval Admin)"
              title="Persetujuan Owner / Admin"
              description="Pembatalan akan reverse jurnal. Masukkan alasan dan kredensial owner/admin."
              variant="danger"
              action={cancelWithApproverAction}
              hiddenFields={{ id: inv.id }}
              reason={{ label: 'Alasan pembatalan', placeholder: 'minimal 5 huruf' }}
            />
          )}
          {(inv.status === 'POSTED' || inv.status === 'PARTIAL') && mayCancel && (
            <form action={cancelAction} className="flex gap-2">
              <input type="hidden" name="id" value={inv.id} />
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
