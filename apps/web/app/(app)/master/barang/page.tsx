import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, buttonClass } from '@/components/ui';
import { ItemListView, type ItemRow } from '@/components/ItemListView';

async function importItemsAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/items/import', file);
  revalidatePath('/master/barang');
  return result;
}

export default async function MasterBarangPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [items, prof] = await Promise.all([
    apiFetch<ItemRow[]>('/items', { tenantId }),
    apiFetch<{ jenisUsaha?: 'DAGANG' | 'JASA' }>('/tenants/current', { tenantId }).catch(() => ({}) as { jenisUsaha?: 'DAGANG' | 'JASA' }),
  ]);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Master Barang & Jasa"
          subtitle={`${items.length} item · klasifikasi PPN mengikuti PMK 131/2024.`}
          actions={
            <>
              <ImportExcelButton importAction={importItemsAction} />
              <Link href="/master/barang/baru" className={buttonClass('primary')}>+ Tambah Item</Link>
            </>
          }
        />

        <ItemListView items={items} orgName={s.tenantNama ?? 'Perusahaan'} jenisUsaha={prof.jenisUsaha} />
      </PageContainer>
    </>
  );
}
