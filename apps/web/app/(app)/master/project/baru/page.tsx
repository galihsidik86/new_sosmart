import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { CancelButton } from '@/components/CancelButton';
import { ProjectForm } from '@/components/ProjectForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface IndustriOpt { id: string; kode: string; nama: string }
interface UserOpt { userId: string; nama: string; email: string }
interface CustomerOpt { id: string; kode: string; nama: string }

async function createProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  try {
    await apiFetch('/projects', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        kode: String(formData.get('kode') ?? ''),
        nama: String(formData.get('nama') ?? ''),
        deskripsi: String(formData.get('deskripsi') ?? '') || undefined,
        tanggalMulai: String(formData.get('tanggalMulai') ?? ''),
        tanggalSelesai: String(formData.get('tanggalSelesai') ?? '') || undefined,
        status: String(formData.get('status') ?? '') || undefined,
        prioritas: String(formData.get('prioritas') ?? '') || undefined,
        budgetTotal: String(formData.get('budgetTotal') ?? '') || undefined,
        nilaiKontrak: String(formData.get('nilaiKontrak') ?? '') || undefined,
        pjUserId: String(formData.get('pjUserId') ?? '') || undefined,
        customerId: String(formData.get('customerId') ?? '') || undefined,
        industriId: String(formData.get('industriId') ?? '') || undefined,
        jenisProjekId: String(formData.get('jenisProjekId') ?? '') || undefined,
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/master/project');
  redirect('/master/project');
}

export default async function ProjectBaruPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [industri, users, customers, jenisProjek] = await Promise.all([
    apiFetch<IndustriOpt[]>('/industri', { tenantId }).catch(() => [] as IndustriOpt[]),
    apiFetch<UserOpt[]>('/users', { tenantId }).catch(() => [] as UserOpt[]),
    apiFetch<CustomerOpt[]>('/customers', { tenantId }).catch(() => [] as CustomerOpt[]),
    apiFetch<{ id: string; nama: string }[]>('/jenis-projek', { tenantId }).catch(() => [] as { id: string; nama: string }[]),
  ]);

  return (
    <PageContainer size="form">
      <div className="mb-2">
        <Link href="/master/project" className="text-sm text-sogan-500 hover:underline">← Kembali ke daftar</Link>
      </div>
      <PageHeader title="Tambah Project" subtitle="Isi detail project baru." />
      <Card padding="lg">
        <ProjectForm
          mode="create"
          action={createProjectAction}
          users={users}
          customers={customers}
          industriList={industri}
          jenisProjekList={jenisProjek}
        />
        <CancelButton href="/master/project" />
      </Card>
    </PageContainer>
  );
}
