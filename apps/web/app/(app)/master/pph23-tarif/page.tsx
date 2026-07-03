import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

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
      <Topbar breadcrumb="Master Tarif PPh 23" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-wedel-900">
            Tarif PPh 23 (jenis jasa)
          </h1>
          <p className="text-sm text-tanah-500 mt-1">
            Referensi tarif sesuai UU PPh Pasal 23 &amp; PMK 141/2015. Attach ke
            item jasa → auto-fill saat transaksi pembelian.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-3 font-bold">Kode</th>
                  <th className="px-4 py-3 font-bold">Nama</th>
                  <th className="px-4 py-3 font-bold text-right w-24">Tarif</th>
                  <th className="px-4 py-3 font-bold">Keterangan</th>
                  <th className="px-4 py-3 font-bold text-center w-24">Aktif</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {list.map((t) => (
                  <tr key={t.id} className={t.isAktif ? '' : 'text-tanah-400 bg-cream-50/40'}>
                    <td className="px-4 py-2 font-mono text-xs text-tanah-700">{t.kode}</td>
                    <td className="px-4 py-2">
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
                            <button className="px-3 py-1.5 bg-sogan-500 hover:bg-sogan-600 text-cream-50 rounded-md text-xs font-semibold">
                              Simpan
                            </button>
                          </div>
                        </form>
                      </details>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{Number(t.tarif)}%</td>
                    <td className="px-4 py-2 text-xs text-tanah-500">{t.keterangan ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      {t.isAktif ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-padi-100 text-padi-700 px-2 py-0.5 rounded">Aktif</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-cream-200 text-tanah-500 px-2 py-0.5 rounded">Non</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteTarif} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-bata-500 hover:underline font-semibold" type="submit">
                          hapus
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-tanah-500">
                    Belum ada tarif. Jalankan seed atau tambah manual di panel kanan.
                  </td></tr>
                )}
              </tbody>
            </table>
          </section>

          <aside className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Tarif</h2>
            <form action={createTarif} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Kode</label>
                <input name="kode" required placeholder="JASA-KONSULTAN"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Nama</label>
                <input name="nama" required placeholder="Jasa konsultan pajak"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tarif (%)</label>
                <input name="tarif" type="number" step="0.01" defaultValue="2" required
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm text-right font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Keterangan</label>
                <textarea name="keterangan" rows={2} placeholder="Referensi peraturan/notes…"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
              </div>
              <button className="w-full py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                Simpan
              </button>
            </form>
          </aside>
        </div>
      </div>
    </>
  );
}
