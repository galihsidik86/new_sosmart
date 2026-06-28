import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

type Role = 'OWNER' | 'ADMIN' | 'AKUNTAN' | 'KASIR' | 'AUDITOR';

interface UserRow {
  userId: string;
  email: string;
  nama: string;
  isActive: boolean;
  role: Role;
  cabang: Array<{ id: string; kode: string; nama: string }>;
  isUnrestricted: boolean;
}
interface Cabang { id: string; kode: string; nama: string }

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner', ADMIN: 'Admin', AKUNTAN: 'Akuntan', KASIR: 'Kasir', AUDITOR: 'Auditor',
};

async function createUserAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const cabangIds = formData.getAll('cabangIds').map(String).filter((v) => v);
  await apiFetch('/users', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      email: formData.get('email'),
      nama: formData.get('nama'),
      password: formData.get('password'),
      role: formData.get('role'),
      cabangIds,
    }),
  });
  revalidatePath('/pengaturan/user');
}

async function deleteUserAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const userId = String(formData.get('userId'));
  await apiFetch(`/users/${userId}`, { method: 'DELETE', tenantId });
  revalidatePath('/pengaturan/user');
}

export default async function UsersPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [users, cabang] = await Promise.all([
    apiFetch<UserRow[]>('/users', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
  ]);

  return (
    <>
      <Topbar breadcrumb="Pengaturan › Pengguna" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-wedel-900">
            Manajemen Pengguna
          </h1>
          <p className="text-sm text-tanah-500 mt-1">
            {users.length} pengguna · admin cabang hanya melihat & mengatur user di cabang yang sama.
            Pemilik tenant (OWNER) tidak tampil bagi admin cabang.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-3 font-bold">Nama / Email</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Akses Cabang</th>
                  <th className="px-4 py-3 font-bold text-center">Aktif</th>
                  <th className="px-4 py-3 font-bold text-right w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {users.map((u) => (
                  <tr key={u.userId} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-tanah-700">{u.nama}</div>
                      <div className="text-xs text-tanah-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          u.role === 'OWNER' ? 'bg-bata-100 text-bata-700' :
                          u.role === 'ADMIN' ? 'bg-sogan-100 text-sogan-700' :
                          'bg-cream-100 text-tanah-700'
                        }`}
                      >
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-tanah-500">
                      {u.isUnrestricted ? (
                        <span className="font-semibold text-padi-700">Semua cabang</span>
                      ) : (
                        u.cabang.map((c) => c.kode).join(', ')
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {u.isActive ? (
                        <span className="text-[10px] font-bold uppercase bg-padi-100 text-padi-700 px-1.5 py-0.5 rounded">Ya</span>
                      ) : (
                        <span className="text-[10px] text-tanah-400">tidak</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/pengaturan/user/${u.userId}/edit` as Route}
                          className="text-xs text-sogan-500 font-semibold hover:underline"
                        >
                          Edit
                        </Link>
                        <form action={deleteUserAction}>
                          <input type="hidden" name="userId" value={u.userId} />
                          <button
                            className="text-xs text-bata-500 font-semibold hover:underline"
                            type="submit"
                          >
                            Hapus
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-tanah-500">
                      Belum ada pengguna di scope ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <aside className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Pengguna</h2>
            <form action={createUserAction} className="space-y-3 text-sm">
              <FF label="Email" name="email" type="email" required />
              <FF label="Nama" name="nama" required />
              <FF label="Password" name="password" type="password" required />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Role</label>
                <select name="role" defaultValue="KASIR"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                  Akses Cabang
                </label>
                <p className="text-[11px] text-tanah-500 mb-2">
                  Kosongkan semua = akses semua cabang (hanya OWNER yang boleh).
                </p>
                <div className="space-y-1.5">
                  {cabang.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-tanah-700">
                      <input type="checkbox" name="cabangIds" value={c.id} />
                      {c.kode} — {c.nama}
                    </label>
                  ))}
                </div>
              </div>
              <button className="w-full py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                Tambahkan
              </button>
            </form>
          </aside>
        </div>
      </div>
    </>
  );
}

function FF(props: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
        {props.label}{props.required && <span className="text-bata-500 ml-0.5">*</span>}
      </label>
      <input
        name={props.name} type={props.type ?? 'text'} required={props.required}
        defaultValue={props.defaultValue}
        className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm focus:outline-none focus:border-sogan-500"
      />
    </div>
  );
}
