import { revalidatePath } from 'next/cache';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp } from '@/lib/format';

interface CabangRow {
  id: string;
  kode: string;
  nama: string;
  kodeCabangNpwp: string | null;
  npwpCabang: string | null;
  alamat: string | null;
  isPusat: boolean;
  isActive: boolean;
}

async function createCabang(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error('Tenant tidak aktif');
  await apiFetch('/cabang', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      npwpCabang: (formData.get('npwpCabang') as string)?.replace(/\D/g, '') || null,
      alamat: formData.get('alamat') || undefined,
      isPusat: formData.get('isPusat') === 'on',
    }),
  });
  revalidatePath('/pengaturan/cabang');
}

export default async function CabangPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const cabang = await apiFetch<CabangRow[]>('/cabang', { tenantId });

  return (
    <>
      <Topbar breadcrumb="Cabang" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-wedel-900">
            Cabang
          </h1>
          <p className="text-sm text-tanah-500 mt-1">
            Setiap cabang fisik dengan kantor terpisah biasanya punya NPWP cabang sendiri
            (kode 3-digit terakhir: 000 = pusat, 001+ = cabang).
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-3 font-bold">Kode</th>
                  <th className="px-4 py-3 font-bold">Nama / Alamat</th>
                  <th className="px-4 py-3 font-bold">NPWP Cabang</th>
                  <th className="px-4 py-3 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {cabang.map((c) => (
                  <tr key={c.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5 font-mono text-tanah-700">{c.kode}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-tanah-700">{c.nama}</div>
                      <div className="text-xs text-tanah-500">{c.alamat ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tanah-500">
                      {fmtNpwp(c.npwpCabang)}
                      {c.kodeCabangNpwp && (
                        <span className="ml-2 text-[10px] text-tanah-400">
                          kode: {c.kodeCabangNpwp}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {c.isPusat && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-emas-100 text-emas-700 px-2 py-0.5 rounded">
                          Pusat
                        </span>
                      )}
                      {!c.isActive && (
                        <span className="text-[10px] text-bata-500">Non-aktif</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <aside className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Cabang</h2>
            <form action={createCabang} className="space-y-3">
              <FF label="Kode" name="kode" required placeholder="BDG" />
              <FF label="Nama" name="nama" required placeholder="Cabang Bandung" />
              <FF label="NPWP cabang" name="npwpCabang" placeholder="012345678901002" />
              <FF label="Alamat" name="alamat" placeholder="Jl. Asia Afrika …" />
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isPusat" />
                Set sebagai pusat
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
