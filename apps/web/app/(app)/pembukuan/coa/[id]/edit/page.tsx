import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, FormField, Input, MoneyInput, Select, Textarea, buttonClass,
} from '@/components/ui';

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
  klasifikasiNeraca:
    | 'ASET_LANCAR' | 'ASET_TETAP' | 'LIABILITAS_PENDEK' | 'LIABILITAS_PANJANG'
    | null;
  isKasSetara: boolean;
  isIntercompany: boolean;
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
      klasifikasiNeraca: (formData.get('klasifikasiNeraca') as string) || null,
      isKasSetara: formData.get('isKasSetara') === 'on',
      isIntercompany: formData.get('isIntercompany') === 'on',
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
      <PageContainer size="form">
        <Link href="/pembukuan/coa" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
        <PageHeader
          title="Edit Akun"
          subtitle={
            <>
              {a.kode} · {a.nama} · <span className="font-mono text-xs">{a.kind}</span> · saldo normal {a.normalBalance}
            </>
          }
          className="mt-2 mb-2"
        />
        <p className="text-xs text-tanah-500 mb-6">
          Jenis akun &amp; saldo normal tidak dapat diubah lewat form ini —
          mengubahnya akan mengganggu interpretasi historis buku besar.
        </p>

        <Card padding="lg">
          <form action={updateAccount} className="space-y-4">
            <input type="hidden" name="id" value={a.id} />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Kode" required><Input name="kode" required defaultValue={a.kode} /></FormField>
              <FormField label="Saldo awal"><MoneyInput name="saldoAwal" defaultValue={a.saldoAwal} /></FormField>
            </div>
            <FormField label="Nama" required><Input name="nama" required defaultValue={a.nama} /></FormField>
            <FormField label="Parent (induk)">
              <Select name="parentId" defaultValue={a.parentId ?? ''}>
                <option value="">— (root)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
                ))}
              </Select>
            </FormField>
            {(a.kind === 'ASET' || a.kind === 'LIABILITAS') && (
              <FormField
                label="Klasifikasi Neraca"
                hint="Menentukan pengelompokan di laporan Neraca & Arus Kas — bukan lagi dari kode akun."
              >
                <Select name="klasifikasiNeraca" defaultValue={a.klasifikasiNeraca ?? ''}>
                  <option value="">— (ikuti konvensi kode)</option>
                  {a.kind === 'ASET' ? (
                    <>
                      <option value="ASET_LANCAR">Aset Lancar</option>
                      <option value="ASET_TETAP">Aset Tetap</option>
                    </>
                  ) : (
                    <>
                      <option value="LIABILITAS_PENDEK">Liabilitas Jangka Pendek</option>
                      <option value="LIABILITAS_PANJANG">Liabilitas Jangka Panjang</option>
                    </>
                  )}
                </Select>
              </FormField>
            )}
            <div className="flex gap-6 pt-1">
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isPostable" defaultChecked={a.isPostable} />
                Postable (bisa dijurnal)
              </label>
              {a.kind === 'ASET' && (
                <label className="flex items-center gap-2 text-sm text-tanah-700">
                  <input type="checkbox" name="isKasSetara" defaultChecked={a.isKasSetara} />
                  Kas &amp; setara kas
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isIntercompany" defaultChecked={a.isIntercompany} />
                Intercompany (eliminasi konsolidasi)
              </label>
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isActive" defaultChecked={a.isActive} />
                Aktif
              </label>
            </div>
            <FormField label="Catatan">
              <Textarea name="catatan" defaultValue={a.catatan ?? ''} rows={2} />
            </FormField>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Simpan perubahan</Button>
              <Link href="/pembukuan/coa" className={buttonClass('ghost')}>
                Batal
              </Link>
            </div>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}
