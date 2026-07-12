import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input,
  Table, THead, TH, TBody, TR, TD, buttonClass,
} from '@/components/ui';

interface CabangRow {
  id: string;
  kode: string;
  nama: string;
  kodeCabangNpwp: string | null;
  npwpCabang: string | null;
  alamat: string | null;
  isPusat: boolean;
  isActive: boolean;
}

async function createCabang(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error('Tenant tidak aktif');
  await apiFetch('/cabang', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      npwpCabang: (formData.get('npwpCabang') as string)?.replace(/\D/g, '') || null,
      alamat: formData.get('alamat') || undefined,
      isPusat: formData.get('isPusat') === 'on',
    }),
  });
  revalidatePath('/pengaturan/cabang');
}

export default async function CabangPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const cabang = await apiFetch<CabangRow[]>('/cabang', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Cabang"
          subtitle="Setiap cabang fisik dengan kantor terpisah biasanya punya NPWP cabang sendiri (kode 3-digit terakhir: 000 = pusat, 001+ = cabang)."
          actions={
            <a href="/proxy/cabang/export.xlsx" className={buttonClass('success')}>
              Export Excel
            </a>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama / Alamat</TH>
                <TH>NPWP Cabang</TH>
                <TH className="text-center">Status</TH>
              </THead>
              <TBody>
                {cabang.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-tanah-700">{c.kode}</TD>
                    <TD>
                      <div className="font-semibold text-tanah-700">{c.nama}</div>
                      <div className="text-xs text-tanah-500">{c.alamat ?? '—'}</div>
                    </TD>
                    <TD className="font-mono text-xs text-tanah-500">
                      {fmtNpwp(c.npwpCabang)}
                      {c.kodeCabangNpwp && (
                        <span className="ml-2 text-[10px] text-tanah-500">
                          kode: {c.kodeCabangNpwp}
                        </span>
                      )}
                    </TD>
                    <TD className="text-center">
                      {c.isPusat && <Badge variant="warning">Pusat</Badge>}
                      {!c.isActive && (
                        <span className="text-[10px] text-bata-500">Non-aktif</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Cabang</h2>
            <form action={createCabang} className="space-y-3">
              <FormField label="Kode" required><Input name="kode" required placeholder="BDG" /></FormField>
              <FormField label="Nama" required><Input name="nama" required placeholder="Cabang Bandung" /></FormField>
              <FormField label="NPWP cabang"><Input name="npwpCabang" placeholder="012345678901002" /></FormField>
              <FormField label="Alamat"><Input name="alamat" placeholder="Jl. Asia Afrika …" /></FormField>
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isPusat" />
                Set sebagai pusat
              </label>
              <Button type="submit" className="w-full">Simpan</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
