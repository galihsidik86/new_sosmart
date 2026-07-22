import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, apiErrorMessage, isNextRedirectError } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, Input, StatusBanner,
  Table, THead, TH, TBody, TR, TD, EmptyRow,
} from '@/components/ui';
import { LiveRefresh } from '@/components/LiveRefresh';

const DOC_LABEL: Record<string, string> = {
  PENJUALAN: 'Penjualan', PEMBELIAN: 'Pembelian', KAS_BANK: 'Kas/Bank', JURNAL: 'Jurnal',
};
const DOC_PATH: Record<string, string> = {
  PENJUALAN: '/transaksi/penjualan', PEMBELIAN: '/transaksi/pembelian',
  KAS_BANK: '/transaksi/kas-bank', JURNAL: '/pembukuan/jurnal',
};

interface InboxItem {
  id: string; docType: string; docId: string; amount: string;
  currentStep: number; totalSteps: number; currentRole: string; createdAt: string;
}

// Keputusan di-bind lewat formAction per tombol — jangan andalkan name/value
// tombol submit karena Next 15 tidak selalu menyertakan submitter ke FormData
// server action (mengakibatkan action=null → 400).
async function actAction(decision: 'SETUJU' | 'TOLAK', formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  try {
    await apiFetch(`/approval/${id}/act`, {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        action: decision,
        catatan: String(formData.get('catatan') ?? '') || undefined,
      }),
    });
  } catch (e) {
    if (isNextRedirectError(e)) throw e; // biarkan redirect (mis. /logout) lewat
    // Tampilkan pesan API yang spesifik sbg banner, bukan error boundary generik.
    redirect(`/approval?err=${encodeURIComponent(apiErrorMessage(e))}`);
  }
  revalidatePath('/approval');
  redirect('/approval'); // sukses → daftar segar & bersihkan ?err lama
}

export default async function ApprovalInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const items = await apiFetch<InboxItem[]>('/approval/inbox', { tenantId });

  return (
    <PageContainer size="list">
      <LiveRefresh intervalMs={8000} />
      <PageHeader
        title="Kotak Approval"
        subtitle={`${items.length} dokumen menunggu persetujuan Anda (role ${s.role}).`}
      />

      {sp.err && (
        <div className="mb-4">
          <StatusBanner
            tone="danger"
            right={
              <Link href={'/approval' as Route} className="text-xs font-semibold underline">
                Tutup
              </Link>
            }
          >
            {sp.err}
          </StatusBanner>
        </div>
      )}

      <Card padding="none">
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TH>Dokumen</TH>
              <TH numeric>Nilai</TH>
              <TH className="text-center">Tingkat</TH>
              <TH>Catatan &amp; Aksi</TH>
            </THead>
            <TBody>
              {items.length === 0 && <EmptyRow colSpan={4}>Tidak ada dokumen menunggu persetujuan Anda.</EmptyRow>}
              {items.map((it) => (
                <TR key={it.id}>
                  <TD>
                    <Link
                      href={`${DOC_PATH[it.docType]}/${it.docId}` as Route}
                      className="text-sogan-500 font-semibold hover:underline"
                    >
                      {DOC_LABEL[it.docType] ?? it.docType}
                    </Link>
                    <div className="text-xs text-tanah-500">{fmtTanggal(it.createdAt)}</div>
                  </TD>
                  <TD className="text-right font-mono tabular-nums">{fmtRp(it.amount)}</TD>
                  <TD className="text-center">
                    <Badge variant="brand">{it.currentStep}/{it.totalSteps} · {it.currentRole}</Badge>
                  </TD>
                  <TD>
                    <form className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={it.id} />
                      <Input name="catatan" placeholder="Catatan (opsional)" className="max-w-[200px]" />
                      <Button type="submit" formAction={actAction.bind(null, 'SETUJU')} variant="success" size="sm">Setuju</Button>
                      <Button type="submit" formAction={actAction.bind(null, 'TOLAK')} variant="danger" size="sm">Tolak</Button>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </PageContainer>
  );
}
