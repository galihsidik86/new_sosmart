import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

interface Vendor {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  kategori: string | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
}

async function updateVendor(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/vendors/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
      isPkp: formData.get('isPkp') === 'on',
      kategori: formData.get('kategori') || null,
      kota: formData.get('kota') || null,
      telp: formData.get('telp') || null,
      terminHari: Number(formData.get('terminHari') ?? 30),
    }),
  });
  revalidatePath('/master/vendor');
  redirect('/master/vendor');
}

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const v = await apiFetch<Vendor>(`/vendors/${id}`, { tenantId });

  return (
    <>
      <Topbar breadcrumb={`Data Vendor › Edit ${v.kode}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/master/vendor" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
          <h1 className="font-display text-3xl font-semibold text-wedel-900 mt-2">Edit Vendor</h1>
          <p className="text-sm text-tanah-500 mt-1">{v.kode} · {v.nama}</p>
        </div>

        <form action={updateVendor} className="bg-white rounded-xl border border-cream-200 shadow-sm p-6 space-y-4">
          <input type="hidden" name="id" value={v.id} />
          <FF label="Kode" name="kode" required defaultValue={v.kode} />
          <FF label="Nama" name="nama" required defaultValue={v.nama} />
          <FF label="NPWP" name="npwp" defaultValue={v.npwp ?? ''} />
          <label className="flex items-center gap-2 text-sm text-tanah-700">
            <input type="checkbox" name="isPkp" defaultChecked={v.isPkp} />
            Vendor ini PKP (PPN masukan dapat dikreditkan)
          </label>
          <FF label="Kategori" name="kategori" defaultValue={v.kategori ?? ''} />
          <div className="grid grid-cols-2 gap-3">
            <FF label="Kota" name="kota" defaultValue={v.kota ?? ''} />
            <FF label="Telp" name="telp" defaultValue={v.telp ?? ''} />
          </div>
          <FF label="Termin (hari)" name="terminHari" type="number" defaultValue={String(v.terminHari)} />
          <div className="flex gap-2 pt-2">
            <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              Simpan perubahan
            </button>
            <Link href="/master/vendor" className="px-4 py-2 bg-cream-100 hover:bg-cream-200 text-tanah-700 font-semibold rounded-lg text-sm">
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
