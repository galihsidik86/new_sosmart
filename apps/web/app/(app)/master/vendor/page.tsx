import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Badge,
  Table, THead, TH, TBody, TR, TD, RowActions, EmptyRow, buttonClass,
} from '@/components/ui';
import { VendorForm } from '@/components/VendorForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

async function importVendorsAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/vendors/import', file);
  revalidatePath('/master/vendor');
  return result;
}

interface VendorRow {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  kategori: string | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  isAktif: boolean;
}

async function createVendor(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, message: 'Tenant tidak aktif' };
  try {
    await apiFetch('/vendors', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
        isPkp: formData.get('isPkp') === 'on',
        kategori: formData.get('kategori') || undefined,
        kota: formData.get('kota') || undefined,
        telp: formData.get('telp') || undefined,
        terminHari: Number(formData.get('terminHari') ?? 30),
      }),
    });
  } catch (e) {
    return apiErrorToState(e);
  }
  revalidatePath('/master/vendor');
  redirect('/master/vendor');
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
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama / Kategori</TH>
                <TH>NPWP</TH>
                <TH className="text-center">PKP</TH>
                <TH numeric>Termin</TH>
                <TH numeric stickyEnd className="w-16" />
              </THead>
              <TBody>
                {vendors.map((v) => (
                  <TR key={v.id}>
                    <TD className="font-mono text-tanah-700">{v.kode}</TD>
                    <TD>
                      <div className="font-semibold text-tanah-700">{v.nama}</div>
                      <div className="text-xs text-tanah-500">
                        {v.kategori ?? '—'} · {v.kota ?? '—'} · {v.telp ?? '—'}
                      </div>
                    </TD>
                    <TD className="font-mono text-xs text-tanah-500">{fmtNpwp(v.npwp)}</TD>
                    <TD className="text-center">
                      {v.isPkp ? (
                        <Badge variant="success" size="sm">PKP</Badge>
                      ) : (
                        <span className="text-[10px] text-tanah-500">non-PKP</span>
                      )}
                    </TD>
                    <TD className="text-right text-tanah-700 tabular-nums">{v.terminHari} hari</TD>
                    <TD stickyEnd className="text-right">
                      <RowActions>
                        <Link href={`/master/vendor/${v.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">
                          Edit
                        </Link>
                      </RowActions>
                    </TD>
                  </TR>
                ))}
                {vendors.length === 0 && <EmptyRow colSpan={6}>Belum ada vendor.</EmptyRow>}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Vendor</h2>
            <VendorForm mode="create" action={createVendor} />
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
