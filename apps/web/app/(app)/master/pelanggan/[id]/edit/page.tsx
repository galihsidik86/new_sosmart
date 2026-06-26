import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

type Tipe = 'DISTRIBUTOR' | 'RITEL' | 'KORPORAT' | 'KOPERASI' | 'PEMERINTAH' | 'LAINNYA';

interface Customer {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  tipe: Tipe;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  kreditLimit: string;
}

const TIPE_LABEL: Record<Tipe, string> = {
  DISTRIBUTOR: 'Distributor',
  RITEL: 'Ritel',
  KORPORAT: 'Korporat',
  KOPERASI: 'Koperasi',
  PEMERINTAH: 'Pemerintah',
  LAINNYA: 'Lainnya',
};

async function updateCustomer(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/customers/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
      isPkp: formData.get('isPkp') === 'on',
      tipe: formData.get('tipe') ?? 'RITEL',
      kota: formData.get('kota') || null,
      telp: formData.get('telp') || null,
      terminHari: Number(formData.get('terminHari') ?? 14),
      kreditLimit: String(formData.get('kreditLimit') ?? '0'),
    }),
  });
  revalidatePath('/master/pelanggan');
  redirect('/master/pelanggan');
}

export default async function EditPelangganPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const c = await apiFetch<Customer>(`/customers/${id}`, { tenantId });

  return (
    <>
      <Topbar breadcrumb={`Data Pelanggan › Edit ${c.kode}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/master/pelanggan" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
          <h1 className="font-display text-3xl font-semibold text-wedel-900 mt-2">Edit Pelanggan</h1>
          <p className="text-sm text-tanah-500 mt-1">{c.kode} · {c.nama}</p>
        </div>

        <form action={updateCustomer} className="bg-white rounded-xl border border-cream-200 shadow-sm p-6 space-y-4">
          <input type="hidden" name="id" value={c.id} />
          <FF label="Kode" name="kode" required defaultValue={c.kode} />
          <FF label="Nama" name="nama" required defaultValue={c.nama} />
          <FF label="NPWP" name="npwp" defaultValue={c.npwp ?? ''} />
          <label className="flex items-center gap-2 text-sm text-tanah-700">
            <input type="checkbox" name="isPkp" defaultChecked={c.isPkp} />
            Pelanggan ini PKP
          </label>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tipe</label>
            <select
              name="tipe" defaultValue={c.tipe}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
            >
              {(Object.keys(TIPE_LABEL) as Tipe[]).map((t) => (
                <option key={t} value={t}>{TIPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Kota" name="kota" defaultValue={c.kota ?? ''} />
            <FF label="Telp" name="telp" defaultValue={c.telp ?? ''} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Termin (hari)" name="terminHari" type="number" defaultValue={String(c.terminHari)} />
            <FF label="Limit kredit" name="kreditLimit" type="number" defaultValue={c.kreditLimit} />
          </div>
          <div className="flex gap-2 pt-2">
            <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              Simpan perubahan
            </button>
            <Link href="/master/pelanggan" className="px-4 py-2 bg-cream-100 hover:bg-cream-200 text-tanah-700 font-semibold rounded-lg text-sm">
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
