import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

type Klasifikasi = 'BKP' | 'JKP' | 'NON_BKP' | 'BKP_STRATEGIS' | 'BEBAS_PPN';

interface Item {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  satuan: string;
  hargaJualDefault: string;
  klasifikasiPpn: Klasifikasi;
  isJasa: boolean;
}

const KLASIFIKASI_LABEL: Record<Klasifikasi, string> = {
  BKP: 'BKP (Kena PPN)',
  JKP: 'JKP (Kena PPN)',
  NON_BKP: 'Non-BKP',
  BKP_STRATEGIS: 'BKP Strategis (0%)',
  BEBAS_PPN: 'Bebas PPN',
};

async function updateItem(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/items/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      kategori: formData.get('kategori') || null,
      satuan: formData.get('satuan') || 'Pcs',
      hargaJualDefault: String(formData.get('hargaJualDefault') ?? '0'),
      klasifikasiPpn: formData.get('klasifikasiPpn') ?? 'BKP',
      isJasa: formData.get('isJasa') === 'on',
    }),
  });
  revalidatePath('/master/barang');
  redirect('/master/barang');
}

export default async function EditBarangPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const item = await apiFetch<Item>(`/items/${id}`, { tenantId });

  return (
    <>
      <Topbar breadcrumb={`Master Barang › Edit ${item.kode}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/master/barang" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
          <h1 className="font-display text-3xl font-semibold text-wedel-900 mt-2">Edit Barang</h1>
          <p className="text-sm text-tanah-500 mt-1">{item.kode} · {item.nama}</p>
        </div>

        <form action={updateItem} className="bg-white rounded-xl border border-cream-200 shadow-sm p-6 space-y-4">
          <input type="hidden" name="id" value={item.id} />
          <FF label="Kode" name="kode" required defaultValue={item.kode} />
          <FF label="Nama" name="nama" required defaultValue={item.nama} />
          <div className="grid grid-cols-2 gap-3">
            <FF label="Kategori" name="kategori" defaultValue={item.kategori ?? ''} />
            <FF label="Satuan" name="satuan" defaultValue={item.satuan} />
          </div>
          <FF label="Harga jual (Rp)" name="hargaJualDefault" type="number" defaultValue={item.hargaJualDefault} />
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Klasifikasi PPN</label>
            <select
              name="klasifikasiPpn" defaultValue={item.klasifikasiPpn}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
            >
              {(['BKP', 'JKP', 'NON_BKP', 'BKP_STRATEGIS', 'BEBAS_PPN'] as const).map((k) => (
                <option key={k} value={k}>{KLASIFIKASI_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-tanah-700">
            <input type="checkbox" name="isJasa" defaultChecked={item.isJasa} />
            Adalah jasa (kena PPh 23)
          </label>
          <div className="flex gap-2 pt-2">
            <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              Simpan perubahan
            </button>
            <Link href="/master/barang" className="px-4 py-2 bg-cream-100 hover:bg-cream-200 text-tanah-700 font-semibold rounded-lg text-sm">
              Batal
            </Link>
          </div>
        </form>
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
