import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Select, SectionHeader,
} from '@/components/ui';

interface Member { id: string; memberTenantId: string; nama: string; ownershipPct: string; authorized: boolean }
interface Group { id: string; nama: string; members: Member[] }
interface Candidate { tenantId: string; nama: string }

async function createGroupAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/consolidation/groups', {
    method: 'POST', tenantId, body: JSON.stringify({ nama: formData.get('nama') }),
  });
  revalidatePath('/laporan/konsolidasi');
}

async function deleteGroupAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch(`/consolidation/groups/${formData.get('id')}`, { method: 'DELETE', tenantId });
  revalidatePath('/laporan/konsolidasi');
}

async function addMemberAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch(`/consolidation/groups/${formData.get('groupId')}/members`, {
    method: 'POST', tenantId,
    body: JSON.stringify({
      memberTenantId: formData.get('memberTenantId'),
      ownershipPct: String(formData.get('ownershipPct') ?? '100'),
    }),
  });
  revalidatePath('/laporan/konsolidasi');
}

async function removeMemberAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch(`/consolidation/members/${formData.get('id')}`, { method: 'DELETE', tenantId });
  revalidatePath('/laporan/konsolidasi');
}

export default async function KonsolidasiPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [groups, candidates] = await Promise.all([
    apiFetch<Group[]>('/consolidation/groups', { tenantId }),
    apiFetch<Candidate[]>('/consolidation/candidates', { tenantId }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageContainer size="list">
      <PageHeader
        title="Konsolidasi Grup"
        subtitle="Gabungkan laporan beberapa badan usaha (tenant) yang Anda kelola, dengan eliminasi otomatis akun intercompany & kepentingan minoritas. Tenant induk = tenant aktif ini."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
          {groups.length === 0 && (
            <Card><p className="text-sm text-tanah-500">Belum ada grup. Buat grup di samping.</p></Card>
          )}
          {groups.map((g) => (
            <Card key={g.id} padding="lg">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-display text-lg font-semibold text-tanah-700">{g.nama}</div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/laporan/konsolidasi/${g.id}?endDate=${today}` as Route}
                    className="text-xs text-sogan-500 font-semibold hover:underline"
                  >
                    Lihat konsolidasi →
                  </Link>
                  <form action={deleteGroupAction}>
                    <input type="hidden" name="id" value={g.id} />
                    <button type="submit" className="text-xs text-bata-500 font-semibold hover:underline">Hapus grup</button>
                  </form>
                </div>
              </div>

              <div className="text-xs text-tanah-500 mb-2">
                Induk: <b>{s.tenantNama ?? 'Tenant aktif'}</b> (100%)
              </div>
              <ul className="space-y-1 mb-3">
                {g.members.length === 0 && <li className="text-sm text-tanah-500">Belum ada anggota anak.</li>}
                {g.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-tanah-700">
                      {m.nama} <Badge variant="neutral">{m.ownershipPct}%</Badge>
                      {!m.authorized && <span className="text-bata-600 text-xs ml-1">(bukan anggota Anda — tak dikonsolidasi)</span>}
                    </span>
                    <form action={removeMemberAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="text-xs text-tanah-500 hover:text-bata-500">hapus</button>
                    </form>
                  </li>
                ))}
              </ul>

              {candidates.length > 0 && (
                <form action={addMemberAction} className="flex flex-wrap items-end gap-2 border-t border-cream-200 pt-3">
                  <input type="hidden" name="groupId" value={g.id} />
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-[11px] uppercase tracking-wider text-tanah-500 font-bold">Tambah anak</label>
                    <Select name="memberTenantId" required>
                      {candidates.map((c) => <option key={c.tenantId} value={c.tenantId}>{c.nama}</option>)}
                    </Select>
                  </div>
                  <div className="w-24">
                    <label className="text-[11px] uppercase tracking-wider text-tanah-500 font-bold">Milik %</label>
                    <Input numeric type="number" step="0.01" min={0} max={100} name="ownershipPct" defaultValue="100" required />
                  </div>
                  <Button type="submit" size="sm" variant="secondary">Tambah</Button>
                </form>
              )}
            </Card>
          ))}
        </section>

        <aside className="space-y-6">
          <Card padding="lg">
            <SectionHeader className="mb-4">Grup Baru</SectionHeader>
            <form action={createGroupAction} className="space-y-4">
              <FormField label="Nama Grup" required>
                <Input name="nama" required placeholder="mis. Sosmart Holding" />
              </FormField>
              <Button type="submit" className="w-full">Buat Grup</Button>
            </form>
          </Card>
          <Card padding="lg">
            <SectionHeader className="mb-2">Catatan</SectionHeader>
            <ul className="text-xs text-tanah-500 space-y-1 list-disc pl-4">
              <li>Anak = tenant lain yang <b>Anda</b> juga jadi anggotanya.</li>
              <li>Akun antar-perusahaan ditandai <b>Intercompany</b> di Bagan Akun → otomatis dieliminasi.</li>
              <li>Kepemilikan &lt; 100% memunculkan <b>kepentingan minoritas</b>.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
