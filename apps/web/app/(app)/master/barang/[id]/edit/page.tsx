import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { CancelButton } from '@/components/CancelButton';
import { ItemForm } from '@/components/ItemForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

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

async function updateItem(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  const isJasa = formData.get('isJasa') === 'on';
  const pph23TarifId = String(formData.get('pph23TarifId') ?? '');
  try {
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
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
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
          <ItemForm mode="edit" action={updateItem} tarifList={tarifList} defaults={item} submitLabel="Simpan perubahan" />
          <CancelButton href="/master/barang" />
        </Card>
      </PageContainer>
    </>
  );
}
