import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

type Ptkp = 'TK_0' | 'TK_1' | 'TK_2' | 'TK_3' | 'K_0' | 'K_1' | 'K_2' | 'K_3' | 'HB_0' | 'HB_1' | 'HB_2' | 'HB_3';

interface Karyawan {
  id: string;
  kode: string;
  nama: string;
  nik: string;
  npwp: string | null;
  jabatan: string | null;
  ptkpStatus: Ptkp;
  cabangId: string | null;
  tanggalMasuk: string;
  gajiPokok: string;
  tunjanganTetap: string;
  iuranBpjsKaryawan: string;
}
interface Cabang { id: string; kode: string; nama: string }

const PTKP_LABEL: Record<Ptkp, string> = {
  TK_0: 'TK/0', TK_1: 'TK/1', TK_2: 'TK/2', TK_3: 'TK/3',
  K_0: 'K/0', K_1: 'K/1', K_2: 'K/2', K_3: 'K/3',
  HB_0: 'HB/0', HB_1: 'HB/1', HB_2: 'HB/2', HB_3: 'HB/3',
};

async function updateKaryawan(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/karyawan/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      cabangId: (formData.get('cabangId') as string) || null,
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      nik: (formData.get('nik') as string)?.replace(/\D/g, ''),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
      jabatan: formData.get('jabatan') || null,
      ptkpStatus: formData.get('ptkpStatus'),
      tanggalMasuk: formData.get('tanggalMasuk'),
      gajiPokok: String(formData.get('gajiPokok') ?? '0'),
      tunjanganTetap: String(formData.get('tunjanganTetap') ?? '0'),
      iuranBpjsKaryawan: String(formData.get('iuranBpjsKaryawan') ?? '0'),
    }),
  });
  revalidatePath('/pajak/karyawan');
  redirect('/pajak/karyawan');
}

export default async function EditKaryawanPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const [k, cabang] = await Promise.all([
    apiFetch<Karyawan>(`/karyawan/${id}`, { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
  ]);

  return (
    <>
      <Topbar breadcrumb={`Karyawan › Edit ${k.kode}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/pajak/karyawan" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
          <h1 className="font-display text-3xl font-semibold text-wedel-900 mt-2">Edit Karyawan</h1>
          <p className="text-sm text-tanah-500 mt-1">{k.kode} · {k.nama}</p>
        </div>

        <form action={updateKaryawan} className="bg-white rounded-xl border border-cream-200 shadow-sm p-6 space-y-4">
          <input type="hidden" name="id" value={k.id} />
          <FF label="Kode" name="kode" required defaultValue={k.kode} />
          <FF label="Nama" name="nama" required defaultValue={k.nama} />
          <FF label="NIK (16 digit)" name="nik" required defaultValue={k.nik} />
          <FF label="NPWP (15-16 digit)" name="npwp" defaultValue={k.npwp ?? ''} />
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">PTKP</label>
            <select
              name="ptkpStatus" required defaultValue={k.ptkpStatus}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono"
            >
              {(Object.keys(PTKP_LABEL) as Ptkp[]).map((p) => (
                <option key={p} value={p}>{PTKP_LABEL[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Cabang</label>
            <select
              name="cabangId" defaultValue={k.cabangId ?? ''}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
            >
              <option value="">—</option>
              {cabang.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}
            </select>
          </div>
          <FF label="Jabatan" name="jabatan" defaultValue={k.jabatan ?? ''} />
          <FF label="Tanggal masuk" name="tanggalMasuk" type="date" required defaultValue={k.tanggalMasuk.slice(0, 10)} />
          <FF label="Gaji pokok" name="gajiPokok" type="number" required defaultValue={k.gajiPokok} />
          <FF label="Tunjangan tetap" name="tunjanganTetap" type="number" defaultValue={k.tunjanganTetap} />
          <FF label="Iuran BPJS karyawan" name="iuranBpjsKaryawan" type="number" defaultValue={k.iuranBpjsKaryawan} />
          <div className="flex gap-2 pt-2">
            <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              Simpan perubahan
            </button>
            <Link href="/pajak/karyawan" className="px-4 py-2 bg-cream-100 hover:bg-cream-200 text-tanah-700 font-semibold rounded-lg text-sm">
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
