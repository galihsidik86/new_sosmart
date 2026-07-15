import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, StatusBanner,
  Table, THead, TH, TBody, TR, TD, EmptyRow,
} from '@/components/ui';

interface Line {
  journalLineId: string;
  nomor: string | null;
  tanggal: string;
  keterangan: string;
  debit: string;
  kredit: string;
  cleared: boolean;
}
interface Detail {
  id: string;
  akun: { id: string; kode: string; nama: string };
  tanggal: string;
  status: 'DRAFT' | 'SELESAI';
  catatan: string | null;
  saldoRekeningKoran: string;
  saldoBuku: string;
  outstandingSetoran: string;
  outstandingPembayaran: string;
  bankDisesuaikan: string;
  selisih: string;
  lines: Line[];
}

async function toggleClear(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/bank-reconciliation/${id}/toggle`, {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      journalLineId: formData.get('journalLineId'),
      cleared: formData.get('cleared') === 'true',
    }),
  });
  revalidatePath(`/pembukuan/rekonsiliasi/${id}`);
}

async function finalizeRecon(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  try {
    await apiFetch(`/bank-reconciliation/${id}/finalize`, { method: 'POST', tenantId, body: '{}' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal finalize';
    redirect(`/pembukuan/rekonsiliasi/${id}?err=${encodeURIComponent(msg)}` as Route);
  }
  revalidatePath(`/pembukuan/rekonsiliasi/${id}`);
}

async function reopenRecon(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/bank-reconciliation/${id}/reopen`, { method: 'POST', tenantId, body: '{}' });
  revalidatePath(`/pembukuan/rekonsiliasi/${id}`);
}

async function deleteRecon(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/bank-reconciliation/${id}`, { method: 'DELETE', tenantId });
  revalidatePath('/pembukuan/rekonsiliasi');
  redirect('/pembukuan/rekonsiliasi');
}

export default async function RekonsiliasiDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const sp = await searchParams;
  const d = await apiFetch<Detail>(`/bank-reconciliation/${id}`, { tenantId });

  const selisihNum = Number(d.selisih);
  const balanced = Math.abs(selisihNum) <= 0.5;
  const isDraft = d.status === 'DRAFT';

  return (
    <PageContainer size="report">
      <Link href="/pembukuan/rekonsiliasi" className="text-sm text-sogan-500 hover:underline">← Rekonsiliasi Bank</Link>
      <PageHeader
        className="mt-2"
        title={<>Rekonsiliasi {d.akun.kode} · {d.akun.nama}</>}
        subtitle={<>Per rekening koran {fmtTanggal(d.tanggal)}</>}
        actions={<Badge variant={d.status === 'SELESAI' ? 'success' : 'neutral'}>{d.status}</Badge>}
      />

      {sp.err && <div className="mb-4"><StatusBanner tone="danger">{sp.err}</StatusBanner></div>}

      {/* Ringkasan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card padding="lg">
          <dl className="text-sm space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-tanah-500">Saldo per rekening koran</dt>
              <dd className="font-mono tabular-nums text-tanah-700">{fmtRp(d.saldoRekeningKoran)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tanah-500">+ Setoran dalam perjalanan</dt>
              <dd className="font-mono tabular-nums text-padi-700">{fmtRp(d.outstandingSetoran)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tanah-500">− Pembayaran belum kliring</dt>
              <dd className="font-mono tabular-nums text-bata-700">({fmtRp(d.outstandingPembayaran)})</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-cream-200 pt-2 font-semibold">
              <dt className="text-tanah-700">= Bank disesuaikan</dt>
              <dd className="font-mono tabular-nums text-tanah-700">{fmtRp(d.bankDisesuaikan)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tanah-500">Saldo buku (GL)</dt>
              <dd className="font-mono tabular-nums text-tanah-700">{fmtRp(d.saldoBuku)}</dd>
            </div>
          </dl>
        </Card>
        <Card padding="lg" className={balanced ? 'bg-padi-50 border-padi-200' : 'bg-bata-50 border-bata-200'}>
          <div className="text-[11px] uppercase tracking-wider font-bold text-tanah-500">Selisih</div>
          <div className={`font-mono tabular-nums text-3xl font-bold mt-1 ${balanced ? 'text-padi-700' : 'text-bata-700'}`}>
            {fmtRp(d.selisih)}
          </div>
          <p className="text-xs text-tanah-600 mt-2">
            {balanced
              ? '✓ Seimbang — saldo buku cocok dengan rekening koran setelah item beredar.'
              : 'Belum seimbang. Centang transaksi yang sudah muncul di rekening koran; untuk biaya admin/jasa giro yang hanya ada di bank, catat jurnal penyesuaian dulu.'}
          </p>
          {isDraft ? (
            <div className="flex items-center gap-2 mt-4">
              <form action={finalizeRecon}>
                <input type="hidden" name="id" value={d.id} />
                <Button type="submit" disabled={!balanced} variant="success" size="sm">Finalize</Button>
              </form>
              <form action={deleteRecon}>
                <input type="hidden" name="id" value={d.id} />
                <Button type="submit" variant="ghost" size="sm">Hapus</Button>
              </form>
            </div>
          ) : (
            <form action={reopenRecon} className="mt-4">
              <input type="hidden" name="id" value={d.id} />
              <Button type="submit" variant="secondary" size="sm">Buka kembali</Button>
            </form>
          )}
        </Card>
      </div>

      {/* Baris transaksi */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-cream-200 flex items-center justify-between">
          <span className="font-semibold text-tanah-700 text-sm">Transaksi Kas/Bank s/d {fmtTanggal(d.tanggal)}</span>
          <span className="text-xs text-tanah-500">
            centang = sudah muncul di rekening koran · {d.lines.filter((l) => l.cleared).length}/{d.lines.length} cleared
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TH className="w-16 text-center">Cleared</TH>
              <TH>Tanggal</TH>
              <TH>No / Keterangan</TH>
              <TH numeric>Debit (masuk)</TH>
              <TH numeric>Kredit (keluar)</TH>
            </THead>
            <TBody>
              {d.lines.length === 0 && <EmptyRow colSpan={5}>Tidak ada transaksi kas/bank s/d tanggal ini.</EmptyRow>}
              {d.lines.map((l) => (
                <TR key={l.journalLineId} className={l.cleared ? 'bg-padi-50/40' : ''}>
                  <TD className="text-center">
                    {isDraft ? (
                      <form action={toggleClear}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="journalLineId" value={l.journalLineId} />
                        <input type="hidden" name="cleared" value={(!l.cleared).toString()} />
                        <button
                          type="submit"
                          title={l.cleared ? 'Batalkan tanda kliring' : 'Tandai sudah kliring'}
                          className={`w-6 h-6 rounded border grid place-items-center text-sm ${
                            l.cleared
                              ? 'bg-padi-500 border-padi-600 text-cream-50'
                              : 'bg-cream-50 border-cream-300 text-transparent hover:border-sogan-400'
                          }`}
                        >
                          ✓
                        </button>
                      </form>
                    ) : (
                      <span className={l.cleared ? 'text-padi-600' : 'text-tanah-300'}>{l.cleared ? '✓' : '—'}</span>
                    )}
                  </TD>
                  <TD className="text-tanah-700 whitespace-nowrap">{fmtTanggal(l.tanggal)}</TD>
                  <TD>
                    {l.nomor && <span className="font-mono text-xs text-tanah-500">{l.nomor}</span>}{' '}
                    <span className="text-tanah-700">{l.keterangan}</span>
                  </TD>
                  <TD className="text-right font-mono tabular-nums text-padi-700">{Number(l.debit) ? fmtRp(l.debit) : '—'}</TD>
                  <TD className="text-right font-mono tabular-nums text-bata-700">{Number(l.kredit) ? fmtRp(l.kredit) : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </PageContainer>
  );
}
