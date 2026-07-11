import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Textarea,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow, type BadgeVariant,
} from '@/components/ui';

type Status = 'AKTIF' | 'SELESAI' | 'DIBATALKAN';

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
  const projects = await apiFetch<ProjectRow[]>(
    `/projects${includeSelesai ? '?includeSelesai=true' : ''}`,
    { tenantId },
  );

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

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2">
            <Table>
              <THead>
                <TH>Kode / Nama</TH>
                <TH>Periode</TH>
                <TH numeric>Budget Total</TH>
                <TH className="text-center">Status</TH>
                <TH className="text-center">Member</TH>
                <TH numeric className="w-24" />
              </THead>
              <TBody>
                {projects.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <div className="font-semibold text-tanah-700">{p.nama}</div>
                      <div className="text-xs text-tanah-500 font-mono">{p.kode}</div>
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
                    <TD className="text-right">
                      <Link
                        href={`/master/project/${p.id}` as Route}
                        className="text-xs text-sogan-500 font-semibold hover:underline"
                      >
                        Detail
                      </Link>
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
              <Button type="submit" className="w-full">Tambah Project</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
