import { revalidatePath } from 'next/cache';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp } from '@/lib/format';

type Tipe = 'DISTRIBUTOR' | 'RITEL' | 'KORPORAT' | 'KOPERASI' | 'PEMERINTAH' | 'LAINNYA';

interface CustomerRow {
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
  isAktif: boolean;
}

const TIPE_LABEL: Record<Tipe, string> = {
  DISTRIBUTOR: 'Distributor',
  RITEL: 'Ritel',
  KORPORAT: 'Korporat',
  KOPERASI: 'Koperasi',
  PEMERINTAH: 'Pemerintah',
  LAINNYA: 'Lainnya',
};

async function createCustomer(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error('Tenant tidak aktif');
  await apiFetch('/customers', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
      isPkp: formData.get('isPkp') === 'on',
      tipe: formData.get('tipe') ?? 'RITEL',
      kota: formData.get('kota') || undefined,
      telp: formData.get('telp') || undefined,
      terminHari: Number(formData.get('terminHari') ?? 14),
      kreditLimit: String(formData.get('kreditLimit') ?? '0'),
    }),
  });
  revalidatePath('/master/pelanggan');
}

export default async function PelangganPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const customers = await apiFetch<CustomerRow[]>('/customers', { tenantId });

  return (
    <>
      <Topbar breadcrumb="Data Pelanggan" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Data Pelanggan
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {customers.length} pelanggan · pelanggan PKP berhak terima faktur pajak.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-3 font-bold">Kode</th>
                  <th className="px-4 py-3 font-bold">Nama / Tipe</th>
                  <th className="px-4 py-3 font-bold">NPWP</th>
                  <th className="px-4 py-3 font-bold text-right">Termin</th>
                  <th className="px-4 py-3 font-bold text-right">Limit Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5 font-mono text-tanah-700">{c.kode}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-tanah-700">{c.nama}</div>
                      <div className="text-xs text-tanah-500 flex items-center gap-2">
                        <span>{TIPE_LABEL[c.tipe]}</span>
                        {c.isPkp && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-padi-100 text-padi-700 px-1.5 py-0.5 rounded">
                            PKP
                          </span>
                        )}
                        <span>· {c.kota ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tanah-500">
                      {fmtNpwp(c.npwp)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-tanah-700 tabular-nums">
                      {c.terminHari} hari
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-tanah-700 tabular-nums">
                      {fmtRp(c.kreditLimit)}
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-tanah-500">
                      Belum ada pelanggan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <aside className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Pelanggan</h2>
            <form action={createCustomer} className="space-y-3">
              <FF label="Kode" name="kode" required placeholder="PLG-006" />
              <FF label="Nama" name="nama" required placeholder="CV …" />
              <FF label="NPWP" name="npwp" placeholder="0X.XXX.XXX.X-XXX.XXX" />
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isPkp" />
                Pelanggan ini PKP
              </label>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                  Tipe
                </label>
                <select
                  name="tipe" defaultValue="RITEL"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
                >
                  {(Object.keys(TIPE_LABEL) as Tipe[]).map((t) => (
                    <option key={t} value={t}>{TIPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FF label="Kota" name="kota" />
                <FF label="Telp" name="telp" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FF label="Termin (hari)" name="terminHari" type="number" defaultValue="14" />
                <FF label="Limit kredit" name="kreditLimit" type="number" defaultValue="0" />
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
