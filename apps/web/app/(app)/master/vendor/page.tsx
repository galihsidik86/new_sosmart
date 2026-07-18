import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, buttonClass } from '@/components/ui';
import { VendorListView, type VendorRow } from '@/components/VendorListView';

async function importVendorsAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/vendors/import', file);
  revalidatePath('/master/vendor');
  return result;
}

export default async function VendorPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const vendors = await apiFetch<VendorRow[]>('/vendors', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Data Vendor"
          subtitle={`${vendors.length} pemasok · status PKP menentukan PPN masukan dapat dikreditkan.`}
          actions={
            <>
              <a href="/proxy/vendors/export.xlsx" className={buttonClass('success')}>Export Excel</a>
              <ImportExcelButton importAction={importVendorsAction} />
              <Link href="/master/vendor/baru" className={buttonClass('primary')}>+ Tambah Vendor</Link>
            </>
          }
        />

        <VendorListView vendors={vendors} orgName={s.tenantNama ?? 'Perusahaan'} />
      </PageContainer>
    </>
  );
}
