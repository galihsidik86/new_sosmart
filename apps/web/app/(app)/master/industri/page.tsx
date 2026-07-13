import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input,
  Table, THead, TH, TBody, TR, TD, RowActions, EmptyRow,
} from '@/components/ui';

interface Industri {
  id: string;
  kode: string;
  nama: string;
  isAktif: boolean;
  _count?: { projects: number };
}

async function createIndustri(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/industri', {
    method: 'POST', tenantId,
    body: JSON.stringify({
      kode: String(formData.get('kode') ?? '').trim(),
      nama: String(formData.get('nama') ?? '').trim(),
    }),
  });
  revalidatePath('/master/industri');
}

async function updateIndustri(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/industri/${id}`, {
    method: 'PATCH', tenantId,
    body: JSON.stringify({
      nama: String(formData.get('nama') ?? '').trim(),
      isAktif: formData.get('isAktif') === 'on',
    }),
  });
  revalidatePath('/master/industri');
}

async function deleteIndustri(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/industri/${id}`, { method: 'DELETE', tenantId });
  revalidatePath('/master/industri');
}

export default async function IndustriPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const list = await apiFetch<Industri[]>('/industri?includeInactive=true', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Jenis Industri"
          subtitle="Klasifikasi industri klien project (mis. Otomotif untuk project di Toyota). Dipakai untuk memfilter laporan per industri."
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama</TH>
                <TH numeric className="w-20">Project</TH>
                <TH className="text-center w-24">Aktif</TH>
                <TH numeric stickyEnd className="w-16" />
              </THead>
              <TBody>
                {list.map((i) => (
                  <TR key={i.id} className={i.isAktif ? '' : 'text-tanah-500 bg-cream-50/40'}>
                    <TD className="font-mono text-xs text-tanah-700">{i.kode}</TD>
                    <TD>
                      <details className="cursor-pointer">
                        <summary className="text-tanah-700 hover:text-sogan-500">{i.nama}</summary>
                        <form action={updateIndustri} className="mt-2 p-3 bg-cream-50 border border-cream-200 rounded-lg space-y-2">
                          <input type="hidden" name="id" value={i.id} />
                          <input name="nama" defaultValue={i.nama} required
                            className="w-full px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm" />
                          <label className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" name="isAktif" defaultChecked={i.isAktif} />
                            Aktif
                          </label>
                          <Button type="submit" variant="primary" size="sm">Simpan</Button>
                        </form>
                      </details>
                    </TD>
                    <TD className="text-right text-tanah-500 tabular-nums">{i._count?.projects ?? 0}</TD>
                    <TD className="text-center">
                      {i.isAktif
                        ? <Badge variant="success" size="sm">Aktif</Badge>
                        : <Badge variant="neutral" size="sm">Non</Badge>}
                    </TD>
                    <TD stickyEnd className="text-right">
                      <RowActions>
                        <form action={deleteIndustri}>
                          <input type="hidden" name="id" value={i.id} />
                          <button className="text-xs text-bata-500 hover:underline font-semibold" type="submit">
                            Hapus
                          </button>
                        </form>
                      </RowActions>
                    </TD>
                  </TR>
                ))}
                {list.length === 0 && (
                  <EmptyRow colSpan={5}>Belum ada jenis industri. Tambah di panel kanan.</EmptyRow>
                )}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Jenis Industri</h2>
            <form action={createIndustri} className="space-y-3">
              <FormField label="Kode" required><Input name="kode" required placeholder="AUTOMOTIVE" mono /></FormField>
              <FormField label="Nama" required><Input name="nama" required placeholder="Otomotif" /></FormField>
              <Button type="submit" className="w-full">Tambah</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
