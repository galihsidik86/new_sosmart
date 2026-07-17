import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Badge,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow, buttonClass,
} from '@/components/ui';
import { ListFilters } from '@/components/ListFilters';
import { buildListHref } from '@/lib/list-query';
import { CustomerForm } from '@/components/CustomerForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

async function importCustomersAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/customers/import', file);
  revalidatePath('/master/pelanggan');
  return result;
}

interface JenisPelanggan { id: string; nama: string }

interface CustomerRow {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  jenisPelanggan: { id: string; nama: string } | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  kreditLimit: string;
  isAktif: boolean;
}

async function createCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, message: 'Tenant tidak aktif' };
  try {
    await apiFetch('/customers', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
        isPkp: formData.get('isPkp') === 'on',
        jenisPelangganId: formData.get('jenisPelangganId') || null,
        kota: formData.get('kota') || undefined,
        telp: formData.get('telp') || undefined,
        terminHari: Number(formData.get('terminHari') ?? 14),
        kreditLimit: String(formData.get('kreditLimit') ?? '0'),
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/master/pelanggan');
  redirect('/master/pelanggan');
}

export default async function PelangganPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; jenisPelangganId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const apiParams = { search: sp.search, jenisPelangganId: sp.jenisPelangganId };
  const [customers, jenisList] = await Promise.all([
    apiFetch<CustomerRow[]>(buildListHref('/customers', apiParams), { tenantId }),
    apiFetch<JenisPelanggan[]>('/jenis-pelanggan', { tenantId }),
  ]);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Data Pelanggan"
          subtitle={`${customers.length} pelanggan · pelanggan PKP berhak terima faktur pajak.`}
          actions={
            <>
              <a href={buildListHref('/proxy/customers/export.xlsx', apiParams)} className={buttonClass('success')}>Export Excel</a>
              <ImportExcelButton importAction={importCustomersAction} />
            </>
          }
        />

        <ListFilters
          action="/master/pelanggan"
          params={sp}
          jenisPelanggan={jenisList}
          searchPlaceholder="Cari kode / nama / NPWP…"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama / Jenis</TH>
                <TH>NPWP</TH>
                <TH numeric>Termin</TH>
                <TH numeric>Limit Kredit</TH>
                <TH numeric stickyEnd className="w-16" />
              </THead>
              <TBody>
                {customers.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-tanah-700">{c.kode}</TD>
                    <TD>
                      <div className="font-semibold text-tanah-700">{c.nama}</div>
                      <div className="text-xs text-tanah-500 flex items-center gap-2">
                        <span>{c.jenisPelanggan?.nama ?? '—'}</span>
                        {c.isPkp && <Badge variant="success" size="sm">PKP</Badge>}
                        <span>· {c.kota ?? '—'}</span>
                      </div>
                    </TD>
                    <TD className="font-mono text-xs text-tanah-500">{fmtNpwp(c.npwp)}</TD>
                    <TD className="text-right text-tanah-700 tabular-nums">{c.terminHari} hari</TD>
                    <MoneyCell className="text-tanah-700">{fmtRp(c.kreditLimit)}</MoneyCell>
                    <TD stickyEnd className="text-right">
                      <RowActions>
                        <Link href={`/master/pelanggan/${c.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">
                          Edit
                        </Link>
                      </RowActions>
                    </TD>
                  </TR>
                ))}
                {customers.length === 0 && <EmptyRow colSpan={6}>Belum ada pelanggan.</EmptyRow>}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Pelanggan</h2>
            <CustomerForm mode="create" action={createCustomer} jenisList={jenisList} />
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
