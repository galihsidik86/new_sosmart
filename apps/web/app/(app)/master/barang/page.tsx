import { revalidatePath } from 'next/cache';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';

interface ItemRow {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  satuan: string;
  hargaJualDefault: string;
  klasifikasiPpn:
    | 'BKP'
    | 'JKP'
    | 'NON_BKP'
    | 'BKP_STRATEGIS'
    | 'BEBAS_PPN';
  isJasa: boolean;
  isAktif: boolean;
  stokAwal: Array<{ qty: string; cabang: { kode: string } }>;
}

const KLASIFIKASI_LABEL: Record<ItemRow['klasifikasiPpn'], string> = {
  BKP: 'BKP (Kena PPN)',
  JKP: 'JKP (Kena PPN)',
  NON_BKP: 'Non-BKP',
  BKP_STRATEGIS: 'BKP Strategis (0%)',
  BEBAS_PPN: 'Bebas PPN',
};

async function createItem(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error('Tenant tidak aktif');
  await apiFetch('/items', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      kategori: formData.get('kategori') || undefined,
      satuan: formData.get('satuan') || 'Pcs',
      hargaJualDefault: String(formData.get('hargaJualDefault') ?? '0'),
      klasifikasiPpn: formData.get('klasifikasiPpn') ?? 'BKP',
      isJasa: formData.get('isJasa') === 'on',
    }),
  });
  revalidatePath('/master/barang');
}

export default async function MasterBarangPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const qs = sp.search ? `?search=${encodeURIComponent(sp.search)}` : '';
  const items = await apiFetch<ItemRow[]>(`/items${qs}`, { tenantId });

  return (
    <>
      <Topbar breadcrumb="Master Barang" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Master Barang & Jasa
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {items.length} item · klasifikasi PPN mengikuti PMK 131/2024.
            </p>
          </div>
          <form className="flex items-center gap-2">
            <input
              name="search"
              defaultValue={sp.search ?? ''}
              placeholder="Cari kode / nama…"
              className="px-3 py-2 bg-white border border-cream-300 rounded-lg text-sm w-64 focus:outline-none focus:border-sogan-500"
            />
            <button className="px-3 py-2 bg-cream-100 border border-cream-300 rounded-lg text-sm font-semibold text-tanah-700">
              Cari
            </button>
          </form>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-3 font-bold">Kode</th>
                  <th className="px-4 py-3 font-bold">Nama</th>
                  <th className="px-4 py-3 font-bold">Klasifikasi PPN</th>
                  <th className="px-4 py-3 font-bold text-right">Harga Jual</th>
                  <th className="px-4 py-3 font-bold text-right">Stok Awal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5 font-mono text-tanah-700">{it.kode}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-tanah-700">{it.nama}</div>
                      <div className="text-xs text-tanah-500">
                        {it.kategori ?? '—'} · {it.satuan}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          it.klasifikasiPpn === 'BKP_STRATEGIS'
                            ? 'bg-padi-100 text-padi-700'
                            : it.klasifikasiPpn === 'NON_BKP' ||
                              it.klasifikasiPpn === 'BEBAS_PPN'
                            ? 'bg-cream-200 text-tanah-500'
                            : 'bg-sogan-50 text-sogan-500'
                        }`}
                      >
                        {KLASIFIKASI_LABEL[it.klasifikasiPpn]}
                      </span>
                      {it.isJasa && (
                        <span className="ml-2 text-[10px] text-emas-700 font-semibold uppercase">
                          Jasa
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-tanah-700 tabular-nums">
                      {fmtRp(it.hargaJualDefault)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-tanah-500 tabular-nums">
                      {it.stokAwal[0]?.qty
                        ? `${Number(it.stokAwal[0].qty).toLocaleString('id-ID')} · ${it.stokAwal[0].cabang.kode}`
                        : '—'}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-tanah-500">
                      Belum ada barang.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <aside className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Item</h2>
            <form action={createItem} className="space-y-3">
              <FormField label="Kode" name="kode" required placeholder="BRG-007" />
              <FormField label="Nama" name="nama" required placeholder="Beras Medium 5 kg" />
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Kategori" name="kategori" placeholder="Sembako" />
                <FormField label="Satuan" name="satuan" defaultValue="Pcs" />
              </div>
              <FormField label="Harga jual (Rp)" name="hargaJualDefault" type="number" defaultValue="0" />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                  Klasifikasi PPN
                </label>
                <select
                  name="klasifikasiPpn"
                  defaultValue="BKP"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
                >
                  {(['BKP', 'JKP', 'NON_BKP', 'BKP_STRATEGIS', 'BEBAS_PPN'] as const).map((k) => (
                    <option key={k} value={k}>
                      {KLASIFIKASI_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isJasa" />
                Adalah jasa (kena PPh 23)
              </label>
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

function FormField(props: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
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
        placeholder={props.placeholder}
        defaultValue={props.defaultValue}
        className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm focus:outline-none focus:border-sogan-500"
      />
    </div>
  );
}
