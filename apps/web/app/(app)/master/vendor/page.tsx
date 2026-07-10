import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { Topbar } from '@/components/Topbar';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input,
  Table, THead, TH, TBody, TR, TD, EmptyRow, buttonClass,
} from '@/components/ui';

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

async function createVendor(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error('Tenant tidak aktif');
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
  revalidatePath('/master/vendor');
}

export default async function VendorPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const vendors = await apiFetch<VendorRow[]>('/vendors', { tenantId });

  return (
    <>
      <Topbar breadcrumb="Data Vendor" tenantNama={s.tenantNama!} />
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

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama / Kategori</TH>
                <TH>NPWP</TH>
                <TH className="text-center">PKP</TH>
                <TH numeric>Termin</TH>
                <TH numeric className="w-16" />
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
                        <span className="text-[10px] text-tanah-400">non-PKP</span>
                      )}
                    </TD>
                    <TD className="text-right text-tanah-700 tabular-nums">{v.terminHari} hari</TD>
                    <TD className="text-right">
                      <Link href={`/master/vendor/${v.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">
                        Edit
                      </Link>
                    </TD>
                  </TR>
                ))}
                {vendors.length === 0 && <EmptyRow colSpan={6}>Belum ada vendor.</EmptyRow>}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Vendor</h2>
            <form action={createVendor} className="space-y-3">
              <FormField label="Kode" required><Input name="kode" required placeholder="VEN-006" /></FormField>
              <FormField label="Nama" required><Input name="nama" required placeholder="PT …" /></FormField>
              <FormField label="NPWP (15/16 digit)"><Input name="npwp" placeholder="01.234.567.8-501.000" /></FormField>
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isPkp" />
                Pemasok ini PKP
              </label>
              <FormField label="Kategori"><Input name="kategori" placeholder="Barang Dagang / Jasa" /></FormField>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Kota"><Input name="kota" /></FormField>
                <FormField label="Telp"><Input name="telp" /></FormField>
              </div>
              <FormField label="Termin (hari)"><Input name="terminHari" type="number" defaultValue="30" /></FormField>
              <Button type="submit" className="w-full">Simpan</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
