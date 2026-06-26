import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

type Kind =
  | 'ASET' | 'LIABILITAS' | 'EKUITAS'
  | 'PENDAPATAN' | 'BEBAN_POKOK' | 'BEBAN'
  | 'PENDAPATAN_LAIN' | 'BEBAN_LAIN';

interface Account {
  id: string;
  kode: string;
  nama: string;
  kind: Kind;
  normalBalance: 'DEBIT' | 'KREDIT';
  isPostable: boolean;
  isActive: boolean;
  parentId: string | null;
  saldoAwal: string;
  catatan: string | null;
}
interface FlatAccount {
  id: string; kode: string; nama: string; parentId: string | null;
}

async function updateAccount(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/accounts/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      parentId: (formData.get('parentId') as string) || null,
      isPostable: formData.get('isPostable') === 'on',
      isActive: formData.get('isActive') === 'on',
      saldoAwal: String(formData.get('saldoAwal') ?? '0'),
      catatan: (formData.get('catatan') as string) || null,
    }),
  });
  revalidatePath('/pembukuan/coa');
  redirect('/pembukuan/coa');
}

export default async function CoaEditPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const [a, all] = await Promise.all([
    apiFetch<Account>(`/accounts/${id}`, { tenantId }),
    apiFetch<FlatAccount[]>('/accounts?view=flat', { tenantId }),
  ]);

  // Calon parent: semua akun kecuali diri sendiri (UI guard; service ulang
  // memvalidasi siklus untuk descendant juga).
  const parentOptions = all.filter((x) => x.id !== id);

  return (
    <>
      <Topbar breadcrumb={`Bagan Akun › Edit ${a.kode}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/pembukuan/coa" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
          <h1 className="font-display text-3xl font-semibold text-wedel-900 mt-2">Edit Akun</h1>
          <p className="text-sm text-tanah-500 mt-1">
            {a.kode} · {a.nama} · <span className="font-mono text-xs">{a.kind}</span> · saldo normal {a.normalBalance}
          </p>
          <p className="text-xs text-tanah-400 mt-1">
            Jenis akun &amp; saldo normal tidak dapat diubah lewat form ini —
            mengubahnya akan mengganggu interpretasi historis buku besar.
          </p>
        </div>

        <form action={updateAccount} className="bg-white rounded-xl border border-cream-200 shadow-sm p-6 space-y-4">
          <input type="hidden" name="id" value={a.id} />
          <div className="grid grid-cols-2 gap-3">
            <FF label="Kode" name="kode" required defaultValue={a.kode} />
            <FF label="Saldo awal" name="saldoAwal" type="number" defaultValue={a.saldoAwal} />
          </div>
          <FF label="Nama" name="nama" required defaultValue={a.nama} />
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Parent (induk)</label>
            <select
              name="parentId" defaultValue={a.parentId ?? ''}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
            >
              <option value="">— (root)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-tanah-700">
              <input type="checkbox" name="isPostable" defaultChecked={a.isPostable} />
              Postable (bisa dijurnal)
            </label>
            <label className="flex items-center gap-2 text-sm text-tanah-700">
              <input type="checkbox" name="isActive" defaultChecked={a.isActive} />
              Aktif
            </label>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Catatan</label>
            <textarea
              name="catatan" defaultValue={a.catatan ?? ''} rows={2}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm focus:outline-none focus:border-sogan-500"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              Simpan perubahan
            </button>
            <Link href="/pembukuan/coa" className="px-4 py-2 bg-cream-100 hover:bg-cream-200 text-tanah-700 font-semibold rounded-lg text-sm">
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
