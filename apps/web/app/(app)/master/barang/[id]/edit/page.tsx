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
  pph23TarifId: string | null;
}
interface Pph23Tarif { id: string; kode: string; nama: string; tarif: string }

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
  const isJasa = formData.get('isJasa') === 'on';
  const pph23TarifId = String(formData.get('pph23TarifId') ?? '');
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
      isJasa,
      pph23TarifId: isJasa && pph23TarifId ? pph23TarifId : null,
    }),
  });
  revalidatePath('/master/barang');
  redirect('/master/barang');
}

export default async function EditBarangPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const [item, tarifList] = await Promise.all([
    apiFetch<Item>(`/items/${id}`, { tenantId }),
    apiFetch<Pph23Tarif[]>('/pph23-tarif', { tenantId }).catch(() => [] as Pph23Tarif[]),
  ]);

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
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Tarif PPh 23 <span className="text-tanah-400 normal-case font-normal">(hanya jika jasa)</span>
            </label>
            <select name="pph23TarifId" defaultValue={item.pph23TarifId ?? ''}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
              <option value="">— tidak preset —</option>
              {tarifList.map((t) => (
                <option key={t.id} value={t.id}>
                  {Number(t.tarif)}% · {t.nama}
                </option>
              ))}
            </select>
          </div>
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
