import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Select, Textarea, buttonClass,
} from '@/components/ui';

type Status = 'AKTIF' | 'SELESAI' | 'DIBATALKAN';
type MemberRole = 'MANAGER' | 'MEMBER';

interface ProjectDetail {
  id: string;
  kode: string;
  nama: string;
  deskripsi: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  status: Status;
  budgetTotal: string | null;
  catatan: string | null;
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

async function updateAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/projects/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      nama: formData.get('nama'),
      status: formData.get('status'),
      tanggalSelesai: formData.get('tanggalSelesai') || null,
      budgetTotal: formData.get('budgetTotal') || null,
      catatan: formData.get('catatan') || null,
    }),
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
  const [p, users, accounts] = await Promise.all([
    apiFetch<ProjectDetail>(`/projects/${id}`, { tenantId }),
    apiFetch<UserRow[]>('/users', { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
  ]);
  const memberUserIds = new Set(p.members.map((m) => m.userId));
  const nonMembers = users.filter((u) => !memberUserIds.has(u.userId));
  const postableAccounts = accounts.filter((a) => a.isPostable);

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
          subtitle={p.deskripsi || undefined}
          actions={
            <Link
              href={`/laporan/budget-actual?projectId=${p.id}` as Route}
              className={buttonClass('soft-sogan')}
            >
              Lihat Realisasi Anggaran →
            </Link>
          }
        />

        <div className="grid grid-cols-2 gap-6 mb-6">
          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Info & Status</h2>
            <form action={updateAction} className="space-y-3 text-sm">
              <input type="hidden" name="id" value={p.id} />
              <FormField label="Nama" required><Input name="nama" defaultValue={p.nama} required /></FormField>
              <FormField label="Tanggal Selesai"><Input name="tanggalSelesai" type="date" defaultValue={p.tanggalSelesai?.slice(0, 10) ?? ''} /></FormField>
              <FormField label="Budget Total"><Input name="budgetTotal" type="number" defaultValue={p.budgetTotal ?? ''} /></FormField>
              <FormField label="Status">
                <Select name="status" defaultValue={p.status}>
                  <option value="AKTIF">AKTIF</option>
                  <option value="SELESAI">SELESAI</option>
                  <option value="DIBATALKAN">DIBATALKAN</option>
                </Select>
              </FormField>
              <FormField label="Catatan"><Textarea name="catatan" rows={2} defaultValue={p.catatan ?? ''} /></FormField>
              <Button type="submit" className="w-full">Simpan</Button>
            </form>
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
