import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, buttonClass } from '@/components/ui';
import { KaryawanListView, type KaryawanRow } from '@/components/KaryawanListView';

async function importKaryawanAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/karyawan/import', file);
  revalidatePath('/pajak/karyawan');
  return result;
}

export default async function KaryawanPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const rows = await apiFetch<KaryawanRow[]>('/karyawan', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Master Karyawan"
          subtitle={`${rows.length} karyawan · PTKP menentukan kategori TER PMK 168/2023 untuk PPh 21 bulanan.`}
          actions={
            <>
              <ImportExcelButton importAction={importKaryawanAction} />
              <Link href="/pajak/karyawan/baru" className={buttonClass('primary')}>+ Tambah Karyawan</Link>
            </>
          }
        />

        <KaryawanListView rows={rows} orgName={s.tenantNama ?? 'Perusahaan'} />
      </PageContainer>
    </>
  );
}
