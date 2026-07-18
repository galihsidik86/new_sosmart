import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, buttonClass } from '@/components/ui';
import { CustomerListView, type CustomerRow } from '@/components/CustomerListView';

async function importCustomersAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/customers/import', file);
  revalidatePath('/master/pelanggan');
  return result;
}

export default async function PelangganPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const customers = await apiFetch<CustomerRow[]>('/customers', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Data Pelanggan"
          subtitle={`${customers.length} pelanggan · pelanggan PKP berhak terima faktur pajak.`}
          actions={
            <>
              <a href="/proxy/customers/export.xlsx" className={buttonClass('success')}>Export Excel</a>
              <ImportExcelButton importAction={importCustomersAction} />
              <Link href="/master/pelanggan/baru" className={buttonClass('primary')}>+ Tambah Pelanggan</Link>
            </>
          }
        />

        <CustomerListView customers={customers} orgName={s.tenantNama ?? 'Perusahaan'} />
      </PageContainer>
    </>
  );
}
