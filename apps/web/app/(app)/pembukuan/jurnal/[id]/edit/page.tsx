import { notFound, redirect } from 'next/navigation';
import { JurnalForm } from '@/components/JurnalForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';
import { BackLink } from '@/components/BackLink';
import { apiErrorToState, type FormState } from '@/lib/form-state';

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
  linkBuktiTambahan: string[];
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

  async function submitEdit(formData: FormData): Promise<FormState> {
    'use server';
    const tid = await getActiveTenantId();
    if (!tid) redirect('/login');
    const payload = JSON.parse(String(formData.get('payload')));
    try {
      await apiFetch(`/journals/${id}`, {
        method: 'PATCH',
        tenantId: tid,
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return apiErrorToState(e);
    }
    return { ok: true };
  }

  return (
    <>
      <PageContainer size="form">
        <BackLink href={`/pembukuan/jurnal/${id}`} label="← Kembali ke detail jurnal" />
        <PageHeader title="Edit Draft Jurnal" />
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
            linkBuktiTambahan: j.linkBuktiTambahan ?? [],
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
      </PageContainer>
    </>
  );
}
