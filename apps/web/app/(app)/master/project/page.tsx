import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Select, Textarea,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow, type BadgeVariant,
} from '@/components/ui';

type Status = 'AKTIF' | 'SELESAI' | 'DIBATALKAN';
interface IndustriOpt { id: string; kode: string; nama: string }

const STATUS_VARIANT: Record<Status, BadgeVariant> = {
  AKTIF: 'success',
  SELESAI: 'neutral',
  DIBATALKAN: 'danger',
};

interface ProjectRow {
  id: string;
  kode: string;
  nama: string;
  deskripsi: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  status: Status;
  budgetTotal: string | null;
  industri: IndustriOpt | null;
  _count: { members: number; budgets: number };
}

async function createProjectAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/projects', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      kode: String(formData.get('kode') ?? ''),
      nama: String(formData.get('nama') ?? ''),
      deskripsi: String(formData.get('deskripsi') ?? '') || undefined,
      tanggalMulai: String(formData.get('tanggalMulai') ?? ''),
      tanggalSelesai: String(formData.get('tanggalSelesai') ?? '') || undefined,
      budgetTotal: String(formData.get('budgetTotal') ?? '') || undefined,
      industriId: String(formData.get('industriId') ?? '') || undefined,
    }),
  });
  revalidatePath('/master/project');
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
  const [projects, industri] = await Promise.all([
    apiFetch<ProjectRow[]>(
      `/projects${includeSelesai ? '?includeSelesai=true' : ''}`,
      { tenantId },
    ),
    apiFetch<IndustriOpt[]>('/industri', { tenantId }).catch(() => [] as IndustriOpt[]),
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
                      {p.industri && (
                        <Badge variant="neutral" size="sm" className="mt-1">{p.industri.nama}</Badge>
                      )}
                    </TD>
                    <TD className="text-xs text-tanah-500">
                      {fmtTanggal(p.tanggalMulai)}
                      {p.tanggalSelesai && <> – {fmtTanggal(p.tanggalSelesai)}</>}
                    </TD>
                    <MoneyCell>
                      {p.budgetTotal ? fmtRp(p.budgetTotal) : <span className="text-tanah-300">—</span>}
                    </MoneyCell>
                    <TD className="text-center">
                      <Badge
                        variant={STATUS_VARIANT[p.status]}
                        size="sm"
                        className={p.status === 'DIBATALKAN' ? 'line-through' : undefined}
                      >
                        {p.status}
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
                {projects.length === 0 && <EmptyRow colSpan={6}>Belum ada project.</EmptyRow>}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Project</h2>
            <form action={createProjectAction} className="space-y-3 text-sm">
              <FormField label="Kode" required><Input name="kode" required placeholder="PRJ-001" /></FormField>
              <FormField label="Nama Project" required><Input name="nama" required /></FormField>
              <FormField label="Deskripsi"><Textarea name="deskripsi" rows={2} /></FormField>
              <FormField label="Tanggal Mulai" required><Input name="tanggalMulai" type="date" required /></FormField>
              <FormField label="Tanggal Selesai"><Input name="tanggalSelesai" type="date" /></FormField>
              <FormField label="Budget Total (opsional)"><Input name="budgetTotal" type="number" placeholder="0" /></FormField>
              <FormField label="Jenis Industri (opsional)">
                <Select name="industriId" defaultValue="">
                  <option value="">— pilih industri —</option>
                  {industri.map((i) => (
                    <option key={i.id} value={i.id}>{i.nama}</option>
                  ))}
                </Select>
              </FormField>
              <Button type="submit" className="w-full">Tambah Project</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
