import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Textarea,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow,
} from '@/components/ui';

interface Tarif {
  id: string;
  kode: string;
  nama: string;
  tarif: string;
  keterangan: string | null;
  isAktif: boolean;
}

async function createTarif(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/pph23-tarif', {
    method: 'POST', tenantId,
    body: JSON.stringify({
      kode: String(formData.get('kode') ?? '').trim(),
      nama: String(formData.get('nama') ?? '').trim(),
      tarif: String(formData.get('tarif') ?? '0'),
      keterangan: String(formData.get('keterangan') ?? '').trim() || null,
    }),
  });
  revalidatePath('/master/pph23-tarif');
}

async function updateTarif(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/pph23-tarif/${id}`, {
    method: 'PATCH', tenantId,
    body: JSON.stringify({
      nama: String(formData.get('nama') ?? '').trim(),
      tarif: String(formData.get('tarif') ?? '0'),
      keterangan: String(formData.get('keterangan') ?? '').trim() || null,
      isAktif: formData.get('isAktif') === 'on',
    }),
  });
  revalidatePath('/master/pph23-tarif');
}

async function deleteTarif(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/pph23-tarif/${id}`, { method: 'DELETE', tenantId });
  revalidatePath('/master/pph23-tarif');
}

export default async function Pph23TarifPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const list = await apiFetch<Tarif[]>('/pph23-tarif?includeInactive=true', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Tarif PPh 23 (jenis jasa)"
          subtitle={
            <>
              Referensi tarif sesuai UU PPh Pasal 23 &amp; PMK 141/2015. Attach ke
              item jasa → auto-fill saat transaksi pembelian.
            </>
          }
        />

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama</TH>
                <TH numeric className="w-24">Tarif</TH>
                <TH>Keterangan</TH>
                <TH className="text-center w-24">Aktif</TH>
                <TH className="w-16" />
              </THead>
              <TBody>
                {list.map((t) => (
                  <TR key={t.id} className={t.isAktif ? '' : 'text-tanah-400 bg-cream-50/40'}>
                    <TD className="font-mono text-xs text-tanah-700">{t.kode}</TD>
                    <TD>
                      <details className="cursor-pointer">
                        <summary className="text-tanah-700 hover:text-sogan-500">{t.nama}</summary>
                        <form action={updateTarif} className="mt-2 p-3 bg-cream-50 border border-cream-200 rounded-lg space-y-2">
                          <input type="hidden" name="id" value={t.id} />
                          <input name="nama" defaultValue={t.nama} required
                            className="w-full px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm" />
                          <div className="flex gap-2">
                            <input name="tarif" type="number" step="0.01" defaultValue={t.tarif} required
                              className="w-24 px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm text-right font-mono" />
                            <label className="flex items-center gap-1.5 text-xs">
                              <input type="checkbox" name="isAktif" defaultChecked={t.isAktif} />
                              Aktif
                            </label>
                          </div>
                          <input name="keterangan" defaultValue={t.keterangan ?? ''} placeholder="Keterangan…"
                            className="w-full px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm" />
                          <div className="flex gap-2">
                            <Button type="submit" variant="primary" size="sm">Simpan</Button>
                          </div>
                        </form>
                      </details>
                    </TD>
                    <MoneyCell className="font-semibold">{Number(t.tarif)}%</MoneyCell>
                    <TD className="text-xs text-tanah-500">{t.keterangan ?? '—'}</TD>
                    <TD className="text-center">
                      {t.isAktif ? (
                        <Badge variant="success" size="sm">Aktif</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Non</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <form action={deleteTarif} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-bata-500 hover:underline font-semibold" type="submit">
                          hapus
                        </button>
                      </form>
                    </TD>
                  </TR>
                ))}
                {list.length === 0 && (
                  <EmptyRow colSpan={6}>
                    Belum ada tarif. Jalankan seed atau tambah manual di panel kanan.
                  </EmptyRow>
                )}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Tarif</h2>
            <form action={createTarif} className="space-y-3">
              <FormField label="Kode"><Input name="kode" required placeholder="JASA-KONSULTAN" mono /></FormField>
              <FormField label="Nama"><Input name="nama" required placeholder="Jasa konsultan pajak" /></FormField>
              <FormField label="Tarif (%)"><Input name="tarif" type="number" step="0.01" defaultValue="2" required numeric /></FormField>
              <FormField label="Keterangan"><Textarea name="keterangan" rows={2} placeholder="Referensi peraturan/notes…" /></FormField>
              <Button type="submit" className="w-full">Simpan</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
