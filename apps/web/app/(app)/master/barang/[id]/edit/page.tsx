import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, FormField, Input, Select, buttonClass,
} from '@/components/ui';

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
      <PageContainer size="form">
        <Link href="/master/barang" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
        <PageHeader title="Edit Barang" subtitle={`${item.kode} · ${item.nama}`} className="mt-2" />

        <Card padding="lg">
          <form action={updateItem} className="space-y-4">
            <input type="hidden" name="id" value={item.id} />
            <FormField label="Kode" required><Input name="kode" required defaultValue={item.kode} /></FormField>
            <FormField label="Nama" required><Input name="nama" required defaultValue={item.nama} /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Kategori"><Input name="kategori" defaultValue={item.kategori ?? ''} /></FormField>
              <FormField label="Satuan"><Input name="satuan" defaultValue={item.satuan} /></FormField>
            </div>
            <FormField label="Harga jual (Rp)"><Input name="hargaJualDefault" type="number" defaultValue={item.hargaJualDefault} /></FormField>
            <FormField label="Klasifikasi PPN">
              <Select name="klasifikasiPpn" defaultValue={item.klasifikasiPpn}>
                {(['BKP', 'JKP', 'NON_BKP', 'BKP_STRATEGIS', 'BEBAS_PPN'] as const).map((k) => (
                  <option key={k} value={k}>{KLASIFIKASI_LABEL[k]}</option>
                ))}
              </Select>
            </FormField>
            <label className="flex items-center gap-2 text-sm text-tanah-700">
              <input type="checkbox" name="isJasa" defaultChecked={item.isJasa} />
              Adalah jasa (kena PPh 23)
            </label>
            <FormField
              label={
                <>
                  Tarif PPh 23 <span className="text-tanah-400 normal-case font-normal">(hanya jika jasa)</span>
                </>
              }
            >
              <Select name="pph23TarifId" defaultValue={item.pph23TarifId ?? ''}>
                <option value="">— tidak preset —</option>
                {tarifList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {Number(t.tarif)}% · {t.nama}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Simpan perubahan</Button>
              <Link href="/master/barang" className={buttonClass('secondary')}>
                Batal
              </Link>
            </div>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}
