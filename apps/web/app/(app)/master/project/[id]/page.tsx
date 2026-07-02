import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

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
      <Topbar breadcrumb={`Project › ${p.kode}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/master/project" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
          <div className="flex items-baseline gap-3 mt-2">
            <h1 className="font-display text-3xl font-semibold text-wedel-900">{p.nama}</h1>
            <span className="font-mono text-tanah-500">{p.kode}</span>
          </div>
          {p.deskripsi && <p className="text-sm text-tanah-500 mt-1">{p.deskripsi}</p>}
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Info & Status</h2>
            <form action={updateAction} className="space-y-3 text-sm">
              <input type="hidden" name="id" value={p.id} />
              <FF label="Nama" name="nama" defaultValue={p.nama} required />
              <FF label="Tanggal Selesai" name="tanggalSelesai" type="date" defaultValue={p.tanggalSelesai?.slice(0, 10) ?? ''} />
              <FF label="Budget Total" name="budgetTotal" type="number" defaultValue={p.budgetTotal ?? ''} />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Status</label>
                <select name="status" defaultValue={p.status}
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                  <option value="AKTIF">AKTIF</option>
                  <option value="SELESAI">SELESAI</option>
                  <option value="DIBATALKAN">DIBATALKAN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Catatan</label>
                <textarea name="catatan" rows={2} defaultValue={p.catatan ?? ''}
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
              </div>
              <button className="w-full py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                Simpan
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Anggota Project ({p.members.length})</h2>
            <ul className="space-y-1.5 mb-3">
              {p.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-cream-200 last:border-b-0">
                  <div>
                    <div className="text-tanah-700 font-semibold">{m.user.nama}</div>
                    <div className="text-xs text-tanah-500">{m.user.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      m.role === 'MANAGER' ? 'bg-sogan-100 text-sogan-700' : 'bg-cream-100 text-tanah-700'
                    }`}>
                      {m.role}
                    </span>
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
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tambah user</label>
                <select name="userId" required
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                  <option value="">— pilih user —</option>
                  {nonMembers.map((u) => (
                    <option key={u.userId} value={u.userId}>{u.nama} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 items-end">
                <select name="role" defaultValue="MEMBER"
                  className="flex-1 px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                  <option value="MEMBER">MEMBER</option>
                  <option value="MANAGER">MANAGER</option>
                </select>
                <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                  Tambah
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
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
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        b.hardBlock ? 'bg-bata-100 text-bata-700' : 'bg-emas-100 text-emas-700'
                      }`}>
                        {b.hardBlock ? 'HARD' : 'SOFT'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
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
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akun (postable)</label>
              <select name="accountId" required
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                <option value="">— pilih akun —</option>
                {postableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Periode</label>
              <input name="periode" placeholder="2026-07" pattern="\d{4}-\d{2}" required
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Amount</label>
              <input name="amount" type="number" required
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm text-right font-mono" />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-tanah-500 mb-2">
                <input type="checkbox" name="hardBlock" defaultChecked />
                Hard block
              </label>
              <button className="w-full py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                Simpan
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function FF(props: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
        {props.label}
        {props.required && <span className="text-bata-500 ml-0.5">*</span>}
      </label>
      <input
        name={props.name}
        type={props.type ?? 'text'}
        required={props.required}
        defaultValue={props.defaultValue}
        className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm focus:outline-none focus:border-sogan-500"
      />
    </div>
  );
}
