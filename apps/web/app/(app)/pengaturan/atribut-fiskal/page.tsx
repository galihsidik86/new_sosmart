import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';
import { BackLink } from '@/components/BackLink';
import {
  AtributFiskalTable,
  type AkunFiskalRow,
  type FiskalItem,
} from '@/components/AtributFiskalTable';

async function saveAction(items: FiskalItem[]) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/fiskal/akun-attributes', {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({ items }),
  });
  revalidatePath('/pengaturan/atribut-fiskal');
}

export default async function AtributFiskalPage() {
  await getSession();
  const tenantId = (await getActiveTenantId())!;
  const rows = await apiFetch<AkunFiskalRow[]>('/fiskal/akun-attributes', { tenantId });

  return (
    <PageContainer size="list">
      <BackLink href="/dashboard" label="← Kembali ke Dashboard" />
      <PageHeader
        title="Atribut Fiskal Akun"
        subtitle="Tandai perlakuan fiskal tiap akun beban/pendapatan untuk Rekonsiliasi Fiskal (komersial vs pajak). Non-deductible & cadangan → koreksi positif; penghasilan final & bukan objek → koreksi negatif; PARTIAL → sisa (100−%) dikoreksi positif. Akun NONE tidak dikoreksi."
      />
      <AtributFiskalTable rows={rows} action={saveAction} />
    </PageContainer>
  );
}
