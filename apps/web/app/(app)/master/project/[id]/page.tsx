import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Select,
  buttonClass, type BadgeVariant,
} from '@/components/ui';
import { DokumenLinksInput } from '@/components/DokumenLinksInput';
import { LinkBukti } from '@/components/LinkBukti';
import { ProjectForm } from '@/components/ProjectForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

type Status = 'PERENCANAAN' | 'AKTIF' | 'DITAHAN' | 'SELESAI' | 'DIBATALKAN';
type Prioritas = 'RENDAH' | 'SEDANG' | 'TINGGI';
type TaskStatus = 'BELUM' | 'PROSES' | 'SELESAI';
type MemberRole = 'MANAGER' | 'MEMBER';

const STATUS_VARIANT: Record<Status, BadgeVariant> = {
  PERENCANAAN: 'neutral', AKTIF: 'success', DITAHAN: 'warning', SELESAI: 'brand', DIBATALKAN: 'danger',
};
const STATUS_LABEL: Record<Status, string> = {
  PERENCANAAN: 'Perencanaan', AKTIF: 'Aktif', DITAHAN: 'Ditahan', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan',
};
const PRIO_VARIANT: Record<Prioritas, BadgeVariant> = { RENDAH: 'neutral', SEDANG: 'warning', TINGGI: 'danger' };
const TASK_VARIANT: Record<TaskStatus, BadgeVariant> = { BELUM: 'neutral', PROSES: 'warning', SELESAI: 'success' };
const TASK_LABEL: Record<TaskStatus, string> = { BELUM: 'Belum', PROSES: 'Proses', SELESAI: 'Selesai' };
const TASK_STATUSES: TaskStatus[] = ['BELUM', 'PROSES', 'SELESAI'];

interface UserLite { id: string; nama: string; email?: string }
interface Task {
  id: string; nama: string; deskripsi: string | null;
  pjUserId: string | null; tenggat: string | null; status: TaskStatus;
  linkDokumen: string[];
  pjUser: UserLite | null;
}
interface ProjectDetail {
  id: string;
  kode: string;
  nama: string;
  deskripsi: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  status: Status;
  prioritas: Prioritas;
  budgetTotal: string | null;
  nilaiKontrak: string | null;
  catatan: string | null;
  pjUserId: string | null;
  customerId: string | null;
  linkDokumen: string[];
  pjUser: UserLite | null;
  customer: { id: string; kode: string; nama: string } | null;
  progress: number;
  taskDone: number;
  taskTotal: number;
  realisasiBiaya: string;
  realisasiPendapatan: string;
  tasks: Task[];
  members: Array<{
    id: string;
    userId: string;
    role: MemberRole;
    user: { id: string; email: string; nama: string };
  }>;
  budgets: Array<{
    id: string;
    accountId: string;
    periode: string;
    amount: string;
    hardBlock: boolean;
    account: { kode: string; nama: string };
  }>;
}

interface UserRow { userId: string; email: string; nama: string }
interface Account { id: string; kode: string; nama: string; isPostable: boolean }
interface CustomerOpt { id: string; kode: string; nama: string }

async function updateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  try {
    await apiFetch(`/projects/${id}`, {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify({
        nama: formData.get('nama'),
        deskripsi: (formData.get('deskripsi') as string) || null,
        status: formData.get('status'),
        prioritas: formData.get('prioritas'),
        tanggalMulai: formData.get('tanggalMulai') || undefined,
        tanggalSelesai: formData.get('tanggalSelesai') || null,
        budgetTotal: formData.get('budgetTotal') || null,
        nilaiKontrak: formData.get('nilaiKontrak') || null,
        pjUserId: (formData.get('pjUserId') as string) || null,
        customerId: (formData.get('customerId') as string) || null,
        catatan: (formData.get('catatan') as string) || null,
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath(`/master/project/${id}`);
  redirect(`/master/project/${id}`);
}

async function addTaskAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/projects/${id}/tasks`, {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      nama: formData.get('nama'),
      pjUserId: (formData.get('pjUserId') as string) || null,
      tenggat: (formData.get('tenggat') as string) || null,
    }),
  });
  revalidatePath(`/master/project/${id}`);
}

async function setTaskStatusAction(projectId: string, taskId: string, status: TaskStatus) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({ status }),
  });
  revalidatePath(`/master/project/${projectId}`);
}

async function deleteTaskAction(projectId: string, taskId: string) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch(`/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE', tenantId });
  revalidatePath(`/master/project/${projectId}`);
}

function cleanLinks(formData: FormData): string[] {
  return formData.getAll('linkDokumen').map((v) => String(v).trim()).filter(Boolean);
}

async function updateProjectDocsAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/projects/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({ linkDokumen: cleanLinks(formData) }),
  });
  revalidatePath(`/master/project/${id}`);
}

async function updateTaskDocsAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  const taskId = String(formData.get('taskId'));
  await apiFetch(`/projects/${id}/tasks/${taskId}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({ linkDokumen: cleanLinks(formData) }),
  });
  revalidatePath(`/master/project/${id}`);
}

async function addMemberAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/projects/${id}/members`, {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      userId: formData.get('userId'),
      role: formData.get('role'),
    }),
  });
  revalidatePath(`/master/project/${id}`);
}

async function removeMemberAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  const userId = String(formData.get('userId'));
  await apiFetch(`/projects/${id}/members/${userId}`, {
    method: 'DELETE',
    tenantId,
  });
  revalidatePath(`/master/project/${id}`);
}

async function setBudgetAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/projects/${id}/budgets`, {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      accountId: formData.get('accountId'),
      periode: formData.get('periode'),
      amount: formData.get('amount'),
      hardBlock: formData.get('hardBlock') === 'on',
    }),
  });
  revalidatePath(`/master/project/${id}`);
}

async function removeBudgetAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const budgetId = String(formData.get('budgetId'));
  const projectId = String(formData.get('projectId'));
  await apiFetch(`/projects/budgets/${budgetId}`, { method: 'DELETE', tenantId });
  revalidatePath(`/master/project/${projectId}`);
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [p, users, accounts, customers] = await Promise.all([
    apiFetch<ProjectDetail>(`/projects/${id}`, { tenantId }),
    apiFetch<UserRow[]>('/users', { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<CustomerOpt[]>('/customers', { tenantId }).catch(() => [] as CustomerOpt[]),
  ]);
  const memberUserIds = new Set(p.members.map((m) => m.userId));
  const nonMembers = users.filter((u) => !memberUserIds.has(u.userId));
  const postableAccounts = accounts.filter((a) => a.isPostable);
  const biaya = Number(p.realisasiBiaya);
  const pendapatan = Number(p.realisasiPendapatan);
  const budget = p.budgetTotal ? Number(p.budgetTotal) : 0;
  const kontrak = p.nilaiKontrak ? Number(p.nilaiKontrak) : 0;
  const serapanBudget = budget > 0 ? Math.round((biaya / budget) * 100) : 0;

  return (
    <>
      <PageContainer size="form">
        <Link href="/master/project" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
        <PageHeader
          className="mt-2"
          title={
            <span className="flex items-baseline gap-3">
              {p.nama}
              <span className="font-mono text-tanah-500 text-base font-normal">{p.kode}</span>
            </span>
          }
          subtitle={
            <span className="flex items-center gap-2 flex-wrap">
              <Badge variant={STATUS_VARIANT[p.status]} size="sm">{STATUS_LABEL[p.status]}</Badge>
              <Badge variant={PRIO_VARIANT[p.prioritas]} size="sm">Prioritas {p.prioritas.toLowerCase()}</Badge>
              {p.customer && <span className="text-xs text-tanah-500">Klien: {p.customer.nama}</span>}
              {p.pjUser && <span className="text-xs text-tanah-500">· PIC: {p.pjUser.nama}</span>}
            </span>
          }
          actions={
            <Link
              href={`/laporan/budget-actual?projectId=${p.id}` as Route}
              className={buttonClass('soft-sogan')}
            >
              Lihat Realisasi Anggaran →
            </Link>
          }
        />

        {/* Ringkasan: progres + budget vs realisasi */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-2">Progres Tugas</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-sogan-500 tabular-nums">{p.progress}%</span>
              <span className="text-sm text-tanah-500">{p.taskDone}/{p.taskTotal} tugas</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-cream-200 overflow-hidden">
              <div className="h-full bg-sogan-500 rounded-full" style={{ width: `${p.progress}%` }} />
            </div>
            <div className="text-xs text-tanah-500 mt-2">
              {fmtTanggal(p.tanggalMulai)}{p.tanggalSelesai && <> – {fmtTanggal(p.tanggalSelesai)}</>}
            </div>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-2">Biaya (Budget vs Realisasi)</div>
            <div className="text-2xl font-bold text-tanah-700 tabular-nums font-mono">{fmtRp(biaya)}</div>
            <div className="text-xs text-tanah-500">dari budget {budget > 0 ? fmtRp(budget) : '—'}</div>
            {budget > 0 && (
              <div className="mt-2 h-2 rounded-full bg-cream-200 overflow-hidden">
                <div className={`h-full rounded-full ${serapanBudget > 100 ? 'bg-bata-500' : 'bg-padi-500'}`}
                  style={{ width: `${Math.min(serapanBudget, 100)}%` }} />
              </div>
            )}
            {budget > 0 && (
              <div className={`text-xs mt-1 ${serapanBudget > 100 ? 'text-bata-700 font-semibold' : 'text-tanah-500'}`}>
                serapan {serapanBudget}%{serapanBudget > 100 ? ' — melebihi budget' : ''}
              </div>
            )}
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-2">Pendapatan & Laba Berjalan</div>
            <div className="text-2xl font-bold text-tanah-700 tabular-nums font-mono">{fmtRp(pendapatan)}</div>
            <div className="text-xs text-tanah-500">dari kontrak {kontrak > 0 ? fmtRp(kontrak) : '—'}</div>
            <div className={`text-sm mt-2 font-semibold ${pendapatan - biaya >= 0 ? 'text-padi-700' : 'text-bata-700'}`}>
              Laba berjalan: {fmtRp(pendapatan - biaya)}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Info & Status</h2>
            <ProjectForm
              mode="edit"
              action={updateAction}
              users={users}
              customers={customers}
              defaults={p}
              submitLabel="Simpan"
            />
          </Card>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Anggota Project ({p.members.length})</h2>
            <ul className="space-y-1.5 mb-3">
              {p.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-cream-200 last:border-b-0">
                  <div>
                    <div className="text-tanah-700 font-semibold">{m.user.nama}</div>
                    <div className="text-xs text-tanah-500">{m.user.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.role === 'MANAGER' ? 'brand' : 'neutral'} size="sm">
                      {m.role}
                    </Badge>
                    <form action={removeMemberAction} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <button className="text-xs text-bata-500 font-semibold hover:underline" type="submit">
                        hapus
                      </button>
                    </form>
                  </div>
                </li>
              ))}
              {p.members.length === 0 && (
                <li className="text-sm text-tanah-500 py-2">Belum ada anggota.</li>
              )}
            </ul>
            <form action={addMemberAction} className="space-y-2 text-sm pt-2 border-t border-cream-200">
              <input type="hidden" name="id" value={p.id} />
              <FormField label="Tambah user">
                <Select name="userId" required>
                  <option value="">— pilih user —</option>
                  {nonMembers.map((u) => (
                    <option key={u.userId} value={u.userId}>{u.nama} ({u.email})</option>
                  ))}
                </Select>
              </FormField>
              <div className="flex gap-2 items-end">
                <Select name="role" defaultValue="MEMBER" fullWidth={false} className="flex-1">
                  <option value="MEMBER">MEMBER</option>
                  <option value="MANAGER">MANAGER</option>
                </Select>
                <Button type="submit">Tambah</Button>
              </div>
            </form>
          </Card>
        </div>

        <Card className="mb-6">
          <h2 className="font-semibold text-tanah-700 mb-3">Dokumen Projek ({p.linkDokumen.length})</h2>
          {p.linkDokumen.length > 0 && (
            <ul className="space-y-1 mb-3">
              {p.linkDokumen.map((u, i) => (
                <li key={i} className="text-xs flex items-center gap-2">
                  <span className="text-tanah-400">{i + 1}.</span>
                  <LinkBukti url={u} variant="full" />
                </li>
              ))}
            </ul>
          )}
          <form action={updateProjectDocsAction} className="space-y-2 pt-3 border-t border-cream-200">
            <input type="hidden" name="id" value={p.id} />
            <div className="text-xs text-tanah-500">
              Tautan kontrak / proposal / SOW / brief (URL Google Drive, Dropbox, dll).
            </div>
            <DokumenLinksInput initial={p.linkDokumen} />
            <Button type="submit" size="sm">Simpan dokumen</Button>
          </form>
        </Card>

        <Card className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-tanah-700">Tugas &amp; Milestone ({p.taskDone}/{p.taskTotal} selesai)</h2>
            <span className="text-sm text-tanah-500">{p.progress}% progres</span>
          </div>

          <ul className="divide-y divide-cream-200 mb-4">
            {p.tasks.map((t) => (
              <li key={t.id} className="py-2.5 flex items-start gap-3">
                {/* pemilih status: 3 tombol (Belum/Proses/Selesai) */}
                <form className="flex rounded-lg overflow-hidden border border-cream-300 shrink-0">
                  {TASK_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="submit"
                      formAction={setTaskStatusAction.bind(null, p.id, t.id, st)}
                      className={`px-2 py-1 text-[11px] font-semibold transition-colors ${
                        t.status === st
                          ? st === 'SELESAI' ? 'bg-padi-500 text-cream-50'
                            : st === 'PROSES' ? 'bg-emas-300 text-emas-700'
                            : 'bg-cream-300 text-tanah-700'
                          : 'bg-white text-tanah-400 hover:bg-cream-50'
                      }`}
                    >
                      {TASK_LABEL[st]}
                    </button>
                  ))}
                </form>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${t.status === 'SELESAI' ? 'line-through text-tanah-400' : 'text-tanah-700'}`}>
                    {t.nama}
                  </div>
                  <div className="text-xs text-tanah-500 flex items-center gap-2 flex-wrap">
                    {t.pjUser && <span>👤 {t.pjUser.nama}</span>}
                    {t.tenggat && <span>📅 {fmtTanggal(t.tenggat)}</span>}
                    <Badge variant={TASK_VARIANT[t.status]} size="sm">{TASK_LABEL[t.status]}</Badge>
                  </div>
                  <details className="mt-1">
                    <summary className="text-xs text-sogan-500 cursor-pointer hover:underline">
                      📎 Dokumen ({t.linkDokumen.length})
                    </summary>
                    <div className="mt-2 pl-1 space-y-2">
                      {t.linkDokumen.length > 0 && (
                        <ul className="space-y-1">
                          {t.linkDokumen.map((u, i) => (
                            <li key={i} className="text-xs"><LinkBukti url={u} variant="full" /></li>
                          ))}
                        </ul>
                      )}
                      <form action={updateTaskDocsAction} className="space-y-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="taskId" value={t.id} />
                        <DokumenLinksInput initial={t.linkDokumen} />
                        <Button type="submit" size="sm" variant="secondary">Simpan dokumen tugas</Button>
                      </form>
                    </div>
                  </details>
                </div>
                <form>
                  <button
                    type="submit"
                    formAction={deleteTaskAction.bind(null, p.id, t.id)}
                    className="text-xs text-bata-500 font-semibold hover:underline shrink-0"
                  >
                    hapus
                  </button>
                </form>
              </li>
            ))}
            {p.tasks.length === 0 && (
              <li className="py-3 text-sm text-tanah-500">Belum ada tugas. Tambah di bawah.</li>
            )}
          </ul>

          <form action={addTaskAction} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end pt-3 border-t border-cream-200">
            <input type="hidden" name="id" value={p.id} />
            <FormField label="Tugas / milestone" className="sm:col-span-5">
              <Input name="nama" required placeholder="mis. Kickoff meeting" />
            </FormField>
            <FormField label="PIC" className="sm:col-span-3">
              <Select name="pjUserId" defaultValue="">
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>{u.nama}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Tenggat" className="sm:col-span-2">
              <Input name="tenggat" type="date" />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">+ Tambah</Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="font-semibold text-tanah-700 mb-3">Budget per Akun × Bulan ({p.budgets.length})</h2>
          {p.budgets.length > 0 && (
            <table className="w-full text-sm mb-4">
              <thead className="text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                  <th className="pb-2 font-bold">Periode</th>
                  <th className="pb-2 font-bold">Akun</th>
                  <th className="pb-2 font-bold text-right">Anggaran</th>
                  <th className="pb-2 font-bold text-center">Mode</th>
                  <th className="pb-2 font-bold text-right w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {p.budgets.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 font-mono">{b.periode}</td>
                    <td className="py-2">
                      <span className="font-mono text-xs text-sogan-500 font-semibold">{b.account.kode}</span>{' '}
                      <span className="text-tanah-700">{b.account.nama}</span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">{fmtRp(b.amount)}</td>
                    <td className="py-2 text-center">
                      <Badge variant={b.hardBlock ? 'danger' : 'warning'} size="sm">
                        {b.hardBlock ? 'HARD' : 'SOFT'}
                      </Badge>
                    </td>
                    <td className="py-2 text-right space-x-3">
                      <Link
                        href={`/laporan/budget-actual?projectId=${p.id}&periode=${b.periode}` as Route}
                        className="text-xs text-sogan-500 font-semibold hover:underline"
                      >
                        realisasi
                      </Link>
                      <form action={removeBudgetAction} className="inline">
                        <input type="hidden" name="budgetId" value={b.id} />
                        <input type="hidden" name="projectId" value={p.id} />
                        <button className="text-xs text-bata-500 font-semibold hover:underline" type="submit">hapus</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form action={setBudgetAction} className="grid grid-cols-5 gap-2 text-sm items-end pt-3 border-t border-cream-200">
            <input type="hidden" name="id" value={p.id} />
            <FormField label="Akun (postable)" className="col-span-2">
              <Select name="accountId" required>
                <option value="">— pilih akun —</option>
                {postableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Periode">
              <Input name="periode" placeholder="2026-07" pattern="\d{4}-\d{2}" required mono />
            </FormField>
            <FormField label="Amount">
              <Input name="amount" type="number" required numeric />
            </FormField>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-tanah-500 mb-2">
                <input type="checkbox" name="hardBlock" defaultChecked />
                Hard block
              </label>
              <Button type="submit" className="w-full">Simpan</Button>
            </div>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}
