import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow,
} from '@/components/ui';

interface Term {
  id: string;
  nama: string;
  hari: number;
  aktif: boolean;
  urutan: number;
  _count?: { salesInvoices: number; purchaseInvoices: number };
}

async function createTerm(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/term-pembayaran', {
    method: 'POST', tenantId,
    body: JSON.stringify({
      nama: String(formData.get('nama') ?? '').trim(),
      hari: String(formData.get('hari') ?? '0'),
      urutan: String(formData.get('urutan') ?? '0'),
    }),
  });
  revalidatePath('/master/termin-pembayaran');
}

async function updateTerm(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/term-pembayaran/${id}`, {
    method: 'PATCH', tenantId,
    body: JSON.stringify({
      nama: String(formData.get('nama') ?? '').trim(),
      hari: String(formData.get('hari') ?? '0'),
      urutan: String(formData.get('urutan') ?? '0'),
      aktif: formData.get('aktif') === 'on',
    }),
  });
  revalidatePath('/master/termin-pembayaran');
}

async function deleteTerm(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/term-pembayaran/${id}`, { method: 'DELETE', tenantId });
  revalidatePath('/master/termin-pembayaran');
}

export default async function TerminPembayaranPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const list = await apiFetch<Term[]>('/term-pembayaran?includeInactive=true', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Termin Pembayaran"
          subtitle={
            <>
              Skema termin kredit (mis. Net 30, Net 45). Dipakai di faktur
              penjualan/pembelian untuk menghitung jatuh tempo otomatis
              (tanggal + jumlah hari). Hari 0 = jatuh tempo di hari yang sama.
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Nama</TH>
                <TH numeric className="w-24">Hari</TH>
                <TH numeric className="w-24">Dipakai</TH>
                <TH className="text-center w-24">Aktif</TH>
                <TH className="w-16" />
              </THead>
              <TBody>
                {list.map((t) => {
                  const dipakai =
                    (t._count?.salesInvoices ?? 0) + (t._count?.purchaseInvoices ?? 0);
                  return (
                    <TR key={t.id} className={t.aktif ? '' : 'text-tanah-500 bg-cream-50/40'}>
                      <TD>
                        <details className="cursor-pointer">
                          <summary className="text-tanah-700 hover:text-sogan-500">{t.nama}</summary>
                          <form action={updateTerm} className="mt-2 p-3 bg-cream-50 border border-cream-200 rounded-lg space-y-2">
                            <input type="hidden" name="id" value={t.id} />
                            <input name="nama" defaultValue={t.nama} required
                              className="w-full px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm" />
                            <div className="flex gap-2 items-center">
                              <label className="text-xs text-tanah-500">Hari</label>
                              <input name="hari" type="number" min={0} max={365} defaultValue={t.hari} required
                                className="w-20 px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm text-right font-mono" />
                              <label className="text-xs text-tanah-500 ml-2">Urutan</label>
                              <input name="urutan" type="number" min={0} defaultValue={t.urutan}
                                className="w-16 px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-sm text-right font-mono" />
                              <label className="flex items-center gap-1.5 text-xs ml-2">
                                <input type="checkbox" name="aktif" defaultChecked={t.aktif} />
                                Aktif
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <Button type="submit" variant="primary" size="sm">Simpan</Button>
                            </div>
                          </form>
                        </details>
                      </TD>
                      <MoneyCell className="font-semibold">{t.hari}</MoneyCell>
                      <MoneyCell className="text-tanah-500">{dipakai}</MoneyCell>
                      <TD className="text-center">
                        {t.aktif ? (
                          <Badge variant="success" size="sm">Aktif</Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">Non</Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        <form action={deleteTerm} className="inline">
                          <input type="hidden" name="id" value={t.id} />
                          <button className="text-xs text-bata-500 hover:underline font-semibold" type="submit">
                            hapus
                          </button>
                        </form>
                      </TD>
                    </TR>
                  );
                })}
                {list.length === 0 && (
                  <EmptyRow colSpan={5}>
                    Belum ada termin. Tambah di panel kanan (mis. Net 30 = 30 hari).
                  </EmptyRow>
                )}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Termin</h2>
            <form action={createTerm} className="space-y-3">
              <FormField label="Nama"><Input name="nama" required placeholder="Net 30" /></FormField>
              <FormField label="Jumlah hari"><Input name="hari" type="number" min={0} max={365} defaultValue="30" required numeric /></FormField>
              <FormField label="Urutan tampil"><Input name="urutan" type="number" min={0} defaultValue="0" numeric /></FormField>
              <Button type="submit" className="w-full">Simpan</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
