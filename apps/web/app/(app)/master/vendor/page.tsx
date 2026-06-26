import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp } from '@/lib/format';

interface VendorRow {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  kategori: string | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  isAktif: boolean;
}

async function createVendor(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error('Tenant tidak aktif');
  await apiFetch('/vendors', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
      isPkp: formData.get('isPkp') === 'on',
      kategori: formData.get('kategori') || undefined,
      kota: formData.get('kota') || undefined,
      telp: formData.get('telp') || undefined,
      terminHari: Number(formData.get('terminHari') ?? 30),
    }),
  });
  revalidatePath('/master/vendor');
}

export default async function VendorPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const vendors = await apiFetch<VendorRow[]>('/vendors', { tenantId });

  return (
    <>
      <Topbar breadcrumb="Data Vendor" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Data Vendor
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {vendors.length} pemasok · status PKP menentukan PPN masukan dapat dikreditkan.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-3 font-bold">Kode</th>
                  <th className="px-4 py-3 font-bold">Nama / Kategori</th>
                  <th className="px-4 py-3 font-bold">NPWP</th>
                  <th className="px-4 py-3 font-bold text-center">PKP</th>
                  <th className="px-4 py-3 font-bold text-right">Termin</th>
                  <th className="px-4 py-3 font-bold text-right w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5 font-mono text-tanah-700">{v.kode}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-tanah-700">{v.nama}</div>
                      <div className="text-xs text-tanah-500">
                        {v.kategori ?? '—'} · {v.kota ?? '—'} · {v.telp ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tanah-500">
                      {fmtNpwp(v.npwp)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {v.isPkp ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-padi-100 text-padi-700 px-2 py-0.5 rounded">
                          PKP
                        </span>
                      ) : (
                        <span className="text-[10px] text-tanah-400">non-PKP</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-tanah-700 tabular-nums">
                      {v.terminHari} hari
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/master/vendor/${v.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
                {vendors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-tanah-500">
                      Belum ada vendor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <aside className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Vendor</h2>
            <form action={createVendor} className="space-y-3">
              <FF label="Kode" name="kode" required placeholder="VEN-006" />
              <FF label="Nama" name="nama" required placeholder="PT …" />
              <FF label="NPWP (15/16 digit)" name="npwp" placeholder="01.234.567.8-501.000" />
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isPkp" />
                Pemasok ini PKP
              </label>
              <FF label="Kategori" name="kategori" placeholder="Barang Dagang / Jasa" />
              <div className="grid grid-cols-2 gap-2">
                <FF label="Kota" name="kota" />
                <FF label="Telp" name="telp" />
              </div>
              <FF label="Termin (hari)" name="terminHari" type="number" defaultValue="30" />
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

function FF(props: {
  label: string; name: string; required?: boolean;
  type?: string; placeholder?: string; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
        {props.label}
        {props.required && <span className="text-bata-500 ml-0.5">*</span>}
      </label>
      <input
        name={props.name} type={props.type ?? 'text'} required={props.required}
        placeholder={props.placeholder} defaultValue={props.defaultValue}
        className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm focus:outline-none focus:border-sogan-500"
      />
    </div>
  );
}
