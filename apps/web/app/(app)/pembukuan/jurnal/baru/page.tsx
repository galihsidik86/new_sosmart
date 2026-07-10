import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { JurnalForm } from '@/components/JurnalForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';

interface Account {
  id: string;
  kode: string;
  nama: string;
  isPostable: boolean;
  normalBalance: 'DEBIT' | 'KREDIT';
}
interface Cabang { id: string; kode: string; nama: string }
interface Project { id: string; kode: string; nama: string }

async function submitJurnal(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const payload = JSON.parse(String(formData.get('payload')));
  await apiFetch('/journals', {
    method: 'POST',
    tenantId,
    body: JSON.stringify(payload),
  });
}

export default async function JurnalBaruPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [accounts, cabang, projects] = await Promise.all([
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }),
  ]);
  return (
    <>
      <Topbar breadcrumb="Jurnal Umum / Baru" tenantNama={s.tenantNama!} />
      <PageContainer size="form">
        <PageHeader title="Jurnal Baru" />
        <JurnalForm accounts={accounts} cabang={cabang} projects={projects} submit={submitJurnal} />
      </PageContainer>
    </>
  );
}
