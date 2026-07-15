import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow,
} from '@/components/ui';

interface Jenis {
  id: string;
  nama: string;
  aktif: boolean;
  urutan: number;
  _count?: { customers: number };
}

async function createJenis(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/jenis-pelanggan', {
    method: 'POST', tenantId,
    body: JSON.stringify({
      nama: String(formData.get('nama') ?? '').trim(),
      urutan: String(formData.get('urutan') ?? '0'),
    }),
  });
  revalidatePath('/master/jenis-pelanggan');
}

async function updateJenis(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/jenis-pelanggan/${id}`, {
    method: 'PATCH', tenantId,
    body: JSON.stringify({
      nama: String(formData.get('nama') ?? '').trim(),
      urutan: String(formData.get('urutan') ?? '0'),
      aktif: formData.get('aktif') === 'on',
    }),
  });
  revalidatePath('/master/jenis-pelanggan');
}

async function deleteJenis(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/jenis-pelanggan/${id}`, { method: 'DELETE', tenantId });
  revalidatePath('/master/jenis-pelanggan');
}

export default async function JenisPelangganPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const list = await apiFetch<Jenis[]>('/jenis-pelanggan?includeInactive=true', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Jenis Pelanggan"
          subtitle={
            <>
              Segmen/kategori pelanggan yang bisa Anda atur sendiri per perusahaan
              (mis. Consumer Based, Brand Based, Personal Based). Dipilih di form pelanggan.
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Nama</TH>
                <TH numeric className="w-24">Dipakai</TH>
                <TH className="text-center w-24">Aktif</TH>
                <TH className="w-16" />
              </THead>
              <TBody>
                {list.map((t) => (
                  <TR key={t.id} className={t.aktif ? '' : 'text-tanah-500 bg-cream-50/40'}>
                    <TD>
                      <details className="cursor-pointer">
                        <summary className="text-tanah-700 hover:text-sogan-500">{t.nama}</summary>
                        <form action={updateJenis} className="mt-2 p-3 bg-cream-50 border border-cream-200 rounded-lg space-y-2">
                          <input type="hidden" name="id" value={t.id} />
                          <input name="nama" defaultValue={t.nama} required
                            className="w-full px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm" />
                          <div className="flex gap-2 items-center">
                            <label className="text-xs text-tanah-500">Urutan</label>
                            <input name="urutan" type="number" min={0} defaultValue={t.urutan}
                              className="w-16 px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm text-right font-mono" />
                            <label className="flex items-center gap-1.5 text-xs ml-2">
                              <input type="checkbox" name="aktif" defaultChecked={t.aktif} />
                              Aktif
                            </label>
                          </div>
                          <Button type="submit" variant="primary" size="sm">Simpan</Button>
                        </form>
                      </details>
                    </TD>
                    <MoneyCell className="text-tanah-500">{t._count?.customers ?? 0}</MoneyCell>
                    <TD className="text-center">
                      {t.aktif ? (
                        <Badge variant="success" size="sm">Aktif</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Non</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <form action={deleteJenis} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-bata-500 hover:underline font-semibold" type="submit">
                          hapus
                        </button>
                      </form>
                    </TD>
                  </TR>
                ))}
                {list.length === 0 && (
                  <EmptyRow colSpan={4}>
                    Belum ada jenis pelanggan. Tambah di panel kanan (mis. Consumer Based).
                  </EmptyRow>
                )}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Jenis</h2>
            <form action={createJenis} className="space-y-3">
              <FormField label="Nama"><Input name="nama" required placeholder="Consumer Based" /></FormField>
              <FormField label="Urutan tampil"><Input name="urutan" type="number" min={0} defaultValue="0" numeric /></FormField>
              <Button type="submit" className="w-full">Simpan</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
