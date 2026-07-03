import { notFound, redirect } from 'next/navigation';
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
interface JurnalDetail {
  id: string;
  cabangId: string;
  tanggal: string;
  deskripsi: string;
  linkBukti: string | null;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  lines: Array<{
    no: number;
    accountId: string;
    projectId: string | null;
    debit: string;
    kredit: string;
    deskripsi: string | null;
  }>;
}

export default async function JurnalEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [j, accounts, cabang, projects] = await Promise.all([
    apiFetch<JurnalDetail>(`/journals/${id}`, { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }),
  ]);

  if (j.status !== 'DRAFT') {
    // Hanya DRAFT yang bisa diedit — POSTED/REVERSED redirect ke detail.
    redirect(`/pembukuan/jurnal/${id}`);
  }
  if (!j.lines.length) notFound();

  async function submitEdit(formData: FormData) {
    'use server';
    const tid = await getActiveTenantId();
    if (!tid) redirect('/login');
    const payload = JSON.parse(String(formData.get('payload')));
    await apiFetch(`/journals/${id}`, {
      method: 'PATCH',
      tenantId: tid,
      body: JSON.stringify(payload),
    });
  }

  return (
    <>
      <Topbar breadcrumb={`Jurnal / Edit Draft`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-6">
          Edit Draft Jurnal
        </h1>
        <JurnalForm
          accounts={accounts}
          cabang={cabang}
          projects={projects}
          submit={submitEdit}
          redirectTo={`/pembukuan/jurnal/${id}`}
          submitLabel="Simpan perubahan"
          defaultValues={{
            tanggal: j.tanggal.slice(0, 10),
            cabangId: j.cabangId,
            deskripsi: j.deskripsi,
            linkBukti: j.linkBukti ?? '',
            lines: j.lines
              .sort((a, b) => a.no - b.no)
              .map((l) => ({
                accountId: l.accountId,
                projectId: l.projectId ?? '',
                debit: String(Number(l.debit)),
                kredit: String(Number(l.kredit)),
                deskripsi: l.deskripsi ?? '',
              })),
          }}
        />
      </div>
    </>
  );
}
