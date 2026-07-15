import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, Input,
  Table, THead, TH, TBody, TR, TD, EmptyRow,
} from '@/components/ui';

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

async function actAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch(`/approval/${formData.get('id')}/act`, {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      action: formData.get('action'),
      catatan: String(formData.get('catatan') ?? '') || undefined,
    }),
  });
  revalidatePath('/approval');
}

export default async function ApprovalInboxPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const items = await apiFetch<InboxItem[]>('/approval/inbox', { tenantId });

  return (
    <PageContainer size="list">
      <PageHeader
        title="Kotak Approval"
        subtitle={`${items.length} dokumen menunggu persetujuan Anda (role ${s.role}).`}
      />

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
                    <form action={actAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={it.id} />
                      <Input name="catatan" placeholder="Catatan (opsional)" className="max-w-[200px]" />
                      <Button type="submit" name="action" value="SETUJU" variant="success" size="sm">Setuju</Button>
                      <Button type="submit" name="action" value="TOLAK" variant="danger" size="sm">Tolak</Button>
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
