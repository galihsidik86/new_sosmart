import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { JurnalForm } from '@/components/JurnalForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

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
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-6">
          Jurnal Baru
        </h1>
        <JurnalForm accounts={accounts} cabang={cabang} projects={projects} submit={submitJurnal} />
      </div>
    </>
  );
}
