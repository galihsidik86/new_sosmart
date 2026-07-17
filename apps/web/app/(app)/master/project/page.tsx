import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Badge,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow, type BadgeVariant,
} from '@/components/ui';
import { ProjectForm } from '@/components/ProjectForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

type Status = 'PERENCANAAN' | 'AKTIF' | 'DITAHAN' | 'SELESAI' | 'DIBATALKAN';
type Prioritas = 'RENDAH' | 'SEDANG' | 'TINGGI';
interface IndustriOpt { id: string; kode: string; nama: string }
interface UserOpt { userId: string; nama: string; email: string }
interface CustomerOpt { id: string; kode: string; nama: string }

const STATUS_VARIANT: Record<Status, BadgeVariant> = {
  PERENCANAAN: 'neutral',
  AKTIF: 'success',
  DITAHAN: 'warning',
  SELESAI: 'brand',
  DIBATALKAN: 'danger',
};
const STATUS_LABEL: Record<Status, string> = {
  PERENCANAAN: 'Perencanaan', AKTIF: 'Aktif', DITAHAN: 'Ditahan', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan',
};
const PRIO_VARIANT: Record<Prioritas, BadgeVariant> = { RENDAH: 'neutral', SEDANG: 'warning', TINGGI: 'danger' };

interface ProjectRow {
  id: string;
  kode: string;
  nama: string;
  deskripsi: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  status: Status;
  prioritas: Prioritas;
  budgetTotal: string | null;
  industri: IndustriOpt | null;
  pjNama: string | null;
  progress: number;
  taskTotal: number;
  taskDone: number;
  _count: { members: number; budgets: number };
}

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
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/master/project');
  redirect('/master/project');
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ semua?: string }>;
}) {
  const sp = await searchParams;
  const includeSelesai = sp.semua === '1';
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [projects, industri, users, customers] = await Promise.all([
    apiFetch<ProjectRow[]>(
      `/projects${includeSelesai ? '?includeSelesai=true' : ''}`,
      { tenantId },
    ),
    apiFetch<IndustriOpt[]>('/industri', { tenantId }).catch(() => [] as IndustriOpt[]),
    apiFetch<UserOpt[]>('/users', { tenantId }).catch(() => [] as UserOpt[]),
    apiFetch<CustomerOpt[]>('/customers', { tenantId }).catch(() => [] as CustomerOpt[]),
  ]);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Project"
          subtitle={`${projects.length} project · ${includeSelesai ? 'termasuk yang selesai' : 'aktif saja'}`}
          actions={
            <Link
              href={(includeSelesai ? '/master/project' : '/master/project?semua=1') as Route}
              className="text-sm text-sogan-500 hover:underline mt-2"
            >
              {includeSelesai ? 'sembunyikan yang selesai' : 'tampilkan yang selesai'}
            </Link>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Kode / Nama</TH>
                <TH>Periode</TH>
                <TH numeric>Budget Total</TH>
                <TH className="text-center w-32">Progres</TH>
                <TH className="text-center">Status</TH>
                <TH className="text-center">Member</TH>
                <TH numeric stickyEnd className="w-24" />
              </THead>
              <TBody>
                {projects.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <div className="font-semibold text-tanah-700">{p.nama}</div>
                      <div className="text-xs text-tanah-500 font-mono">{p.kode}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant={PRIO_VARIANT[p.prioritas]} size="sm">{p.prioritas.toLowerCase()}</Badge>
                        {p.pjNama && <span className="text-xs text-tanah-500">👤 {p.pjNama}</span>}
                        {p.industri && <Badge variant="neutral" size="sm">{p.industri.nama}</Badge>}
                      </div>
                    </TD>
                    <TD className="text-xs text-tanah-500">
                      {fmtTanggal(p.tanggalMulai)}
                      {p.tanggalSelesai && <> – {fmtTanggal(p.tanggalSelesai)}</>}
                    </TD>
                    <MoneyCell>
                      {p.budgetTotal ? fmtRp(p.budgetTotal) : <span className="text-tanah-300">—</span>}
                    </MoneyCell>
                    <TD className="text-center">
                      {p.taskTotal > 0 ? (
                        <div>
                          <div className="text-xs text-tanah-500 mb-1">{p.progress}% · {p.taskDone}/{p.taskTotal}</div>
                          <div className="h-1.5 rounded-full bg-cream-200 overflow-hidden">
                            <div className="h-full bg-sogan-500 rounded-full" style={{ width: `${p.progress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-tanah-300 text-xs">—</span>
                      )}
                    </TD>
                    <TD className="text-center">
                      <Badge
                        variant={STATUS_VARIANT[p.status]}
                        size="sm"
                        className={p.status === 'DIBATALKAN' ? 'line-through' : undefined}
                      >
                        {STATUS_LABEL[p.status]}
                      </Badge>
                    </TD>
                    <TD className="text-center text-xs text-tanah-500">
                      {p._count.members}
                    </TD>
                    <TD stickyEnd className="text-right">
                      <RowActions>
                        <Link
                          href={`/master/project/${p.id}` as Route}
                          className="text-xs text-sogan-500 font-semibold hover:underline"
                        >
                          Detail
                        </Link>
                      </RowActions>
                    </TD>
                  </TR>
                ))}
                {projects.length === 0 && <EmptyRow colSpan={7}>Belum ada project.</EmptyRow>}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Project</h2>
            <ProjectForm
              mode="create"
              action={createProjectAction}
              users={users}
              customers={customers}
              industriList={industri}
            />
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
