import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, FormField, Input, Select, buttonClass,
} from '@/components/ui';

type Role = 'OWNER' | 'ADMIN' | 'AKUNTAN' | 'KASIR' | 'AUDITOR';

interface UserDetail {
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

async function updateUserAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const userId = String(formData.get('userId'));
  const cabangIds = formData.getAll('cabangIds').map(String).filter((v) => v);
  const password = String(formData.get('password') ?? '');
  await apiFetch(`/users/${userId}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      nama: formData.get('nama'),
      role: formData.get('role'),
      isActive: formData.get('isActive') === 'on',
      cabangIds,
      ...(password ? { password } : {}),
    }),
  });
  revalidatePath('/pengaturan/user');
  redirect('/pengaturan/user');
}

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [u, cabang] = await Promise.all([
    apiFetch<UserDetail>(`/users/${id}`, { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
  ]);
  const checked = new Set(u.cabang.map((c) => c.id));

  return (
    <>
      <Topbar breadcrumb={`Pengguna › Edit ${u.email}`} tenantNama={s.tenantNama!} />
      <PageContainer size="form">
        <Link href="/pengaturan/user" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
        <PageHeader title="Edit Pengguna" subtitle={`${u.nama} · ${u.email}`} className="mt-2" />

        <Card padding="lg">
          <form action={updateUserAction} className="space-y-4">
            <input type="hidden" name="userId" value={u.userId} />
            <FormField label="Nama">
              <Input name="nama" defaultValue={u.nama} required />
            </FormField>
            <FormField
              label="Reset Password"
              hint="Min. 8 karakter. Kosongkan supaya password lama tetap berlaku."
            >
              <Input name="password" type="password" placeholder="kosongkan kalau tidak diganti" />
            </FormField>
            <FormField label="Role">
              <Select name="role" defaultValue={u.role}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </Select>
            </FormField>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akses Cabang</label>
              <p className="text-[11px] text-tanah-500 mb-2">
                Kosongkan semua = akses semua cabang. Admin cabang tidak dapat memberikan akses cabang di luar scope-nya.
              </p>
              <div className="space-y-1.5">
                {cabang.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-tanah-700">
                    <input type="checkbox" name="cabangIds" value={c.id} defaultChecked={checked.has(c.id)} />
                    {c.kode} — {c.nama}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-tanah-700">
              <input type="checkbox" name="isActive" defaultChecked={u.isActive} />
              Akun aktif (bisa login)
            </label>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Simpan perubahan</Button>
              <Link href="/pengaturan/user" className={buttonClass('secondary')}>
                Batal
              </Link>
            </div>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}
