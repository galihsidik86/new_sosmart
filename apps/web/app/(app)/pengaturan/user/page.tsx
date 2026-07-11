import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Select,
  Table, THead, TH, TBody, TR, TD, EmptyRow, type BadgeVariant,
} from '@/components/ui';

type Role = 'OWNER' | 'ADMIN' | 'AKUNTAN' | 'KASIR' | 'AUDITOR';

function roleVariant(role: Role): BadgeVariant {
  if (role === 'OWNER') return 'danger';
  if (role === 'ADMIN') return 'brand';
  return 'neutral';
}

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
      <PageContainer size="list">
        <PageHeader
          title="Manajemen Pengguna"
          subtitle={`${users.length} pengguna · admin cabang hanya melihat & mengatur user di cabang yang sama. Pemilik tenant (OWNER) tidak tampil bagi admin cabang.`}
        />

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2">
            <Table>
              <THead>
                <TH>Nama / Email</TH>
                <TH>Role</TH>
                <TH>Akses Cabang</TH>
                <TH className="text-center">Aktif</TH>
                <TH numeric className="w-24" />
              </THead>
              <TBody>
                {users.map((u) => (
                  <TR key={u.userId}>
                    <TD>
                      <div className="font-semibold text-tanah-700">{u.nama}</div>
                      <div className="text-xs text-tanah-500">{u.email}</div>
                    </TD>
                    <TD>
                      <Badge variant={roleVariant(u.role)}>{ROLE_LABEL[u.role]}</Badge>
                    </TD>
                    <TD className="text-xs text-tanah-500">
                      {u.isUnrestricted ? (
                        <span className="font-semibold text-padi-700">Semua cabang</span>
                      ) : (
                        u.cabang.map((c) => c.kode).join(', ')
                      )}
                    </TD>
                    <TD className="text-center">
                      {u.isActive ? (
                        <Badge variant="success">Ya</Badge>
                      ) : (
                        <span className="text-[10px] text-tanah-500">tidak</span>
                      )}
                    </TD>
                    <TD className="text-right">
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
                    </TD>
                  </TR>
                ))}
                {users.length === 0 && (
                  <EmptyRow colSpan={5}>Belum ada pengguna di scope ini.</EmptyRow>
                )}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Pengguna</h2>
            <form action={createUserAction} className="space-y-3 text-sm">
              <FormField label="Email" required><Input name="email" type="email" required /></FormField>
              <FormField label="Nama" required><Input name="nama" required /></FormField>
              <FormField label="Password" required><Input name="password" type="password" required /></FormField>
              <FormField label="Role">
                <Select name="role" defaultValue="KASIR">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </Select>
              </FormField>
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
              <Button type="submit" className="w-full">Tambahkan</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
