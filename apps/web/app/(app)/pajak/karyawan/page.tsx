import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp } from '@/lib/format';

type Ptkp = 'TK_0' | 'TK_1' | 'TK_2' | 'TK_3' | 'K_0' | 'K_1' | 'K_2' | 'K_3' | 'HB_0' | 'HB_1' | 'HB_2' | 'HB_3';
type Jenis = 'PEGAWAI_TETAP' | 'PEGAWAI_TIDAK_TETAP' | 'BUKAN_PEGAWAI' | 'PENERIMA_PENSIUN';

interface Karyawan {
  id: string;
  kode: string;
  nama: string;
  nik: string;
  npwp: string | null;
  jabatan: string | null;
  ptkpStatus: Ptkp;
  jenisKaryawan: Jenis;
  gajiPokok: string;
  tunjanganTetap: string;
  iuranBpjsKaryawan: string;
  isActive: boolean;
  cabang: { kode: string } | null;
}
interface Cabang { id: string; kode: string; nama: string }

const PTKP_LABEL: Record<Ptkp, string> = {
  TK_0: 'TK/0', TK_1: 'TK/1', TK_2: 'TK/2', TK_3: 'TK/3',
  K_0: 'K/0', K_1: 'K/1', K_2: 'K/2', K_3: 'K/3',
  HB_0: 'HB/0', HB_1: 'HB/1', HB_2: 'HB/2', HB_3: 'HB/3',
};

async function createKaryawan(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/karyawan', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      cabangId: (formData.get('cabangId') as string) || undefined,
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      nik: (formData.get('nik') as string)?.replace(/\D/g, ''),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
      jabatan: formData.get('jabatan') || undefined,
      ptkpStatus: formData.get('ptkpStatus'),
      tanggalMasuk: formData.get('tanggalMasuk'),
      gajiPokok: String(formData.get('gajiPokok') ?? '0'),
      tunjanganTetap: String(formData.get('tunjanganTetap') ?? '0'),
      iuranBpjsKaryawan: String(formData.get('iuranBpjsKaryawan') ?? '0'),
    }),
  });
  revalidatePath('/pajak/karyawan');
}

export default async function KaryawanPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [rows, cabang] = await Promise.all([
    apiFetch<Karyawan[]>('/karyawan', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
  ]);

  return (
    <>
      <Topbar breadcrumb="Karyawan" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Master Karyawan
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {rows.length} karyawan · PTKP menentukan kategori TER PMK 168/2023 untuk PPh 21 bulanan.
            </p>
          </div>
          <a
            href="/proxy/karyawan/export.xlsx"
            className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700"
          >
            Export Excel
          </a>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-3 font-bold">Kode</th>
                  <th className="px-4 py-3 font-bold">Nama / Jabatan</th>
                  <th className="px-4 py-3 font-bold">PTKP</th>
                  <th className="px-4 py-3 font-bold">NPWP</th>
                  <th className="px-4 py-3 font-bold text-right">Gaji Pokok</th>
                  <th className="px-4 py-3 font-bold text-right w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {rows.map((k) => (
                  <tr key={k.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5 font-mono text-tanah-700">{k.kode}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-tanah-700">{k.nama}</div>
                      <div className="text-xs text-tanah-500">{k.jabatan ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs bg-cream-100 text-tanah-700 px-2 py-0.5 rounded">
                        {PTKP_LABEL[k.ptkpStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tanah-500">
                      {k.npwp ? fmtNpwp(k.npwp) : <span className="text-bata-500">tanpa NPWP (+20%)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtRp(k.gajiPokok)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/pajak/karyawan/${k.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-tanah-500">Belum ada karyawan.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <aside className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Karyawan</h2>
            <form action={createKaryawan} className="space-y-3 text-sm">
              <FF label="Kode" name="kode" required placeholder="KAR-006" />
              <FF label="Nama" name="nama" required />
              <FF label="NIK (16 digit)" name="nik" required />
              <FF label="NPWP (15-16 digit)" name="npwp" />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">PTKP</label>
                <select name="ptkpStatus" required defaultValue="TK_0"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono">
                  {(Object.keys(PTKP_LABEL) as Ptkp[]).map((p) => (
                    <option key={p} value={p}>{PTKP_LABEL[p]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Cabang</label>
                <select name="cabangId"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                  <option value="">—</option>
                  {cabang.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}
                </select>
              </div>
              <FF label="Jabatan" name="jabatan" placeholder="Staf …" />
              <FF label="Tanggal masuk" name="tanggalMasuk" type="date" required defaultValue="2024-01-01" />
              <FF label="Gaji pokok" name="gajiPokok" type="number" required defaultValue="0" />
              <FF label="Tunjangan tetap" name="tunjanganTetap" type="number" defaultValue="0" />
              <FF label="Iuran BPJS karyawan" name="iuranBpjsKaryawan" type="number" defaultValue="0" />
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

function FF(props: { label: string; name: string; required?: boolean; type?: string; placeholder?: string; defaultValue?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
        {props.label}{props.required && <span className="text-bata-500 ml-0.5">*</span>}
      </label>
      <input name={props.name} type={props.type ?? 'text'} required={props.required}
        placeholder={props.placeholder} defaultValue={props.defaultValue}
        className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
    </div>
  );
}
