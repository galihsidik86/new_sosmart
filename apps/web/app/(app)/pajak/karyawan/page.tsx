import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { KaryawanForm } from '@/components/KaryawanForm';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp } from '@/lib/format';
import { apiErrorToState, type FormState } from '@/lib/form-state';
import {
  PageContainer, PageHeader, Card,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow, buttonClass,
} from '@/components/ui';

async function importKaryawanAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/karyawan/import', file);
  revalidatePath('/pajak/karyawan');
  return result;
}

type Ptkp = 'TK_0' | 'TK_1' | 'TK_2' | 'TK_3' | 'K_0' | 'K_1' | 'K_2' | 'K_3' | 'HB_0' | 'HB_1' | 'HB_2' | 'HB_3';
type Jenis = 'PEGAWAI_TETAP' | 'PEGAWAI_TIDAK_TETAP' | 'BUKAN_PEGAWAI' | 'PENERIMA_PENSIUN';

interface Karyawan {
  id: string;
  kode: string;
  nama: string;
  nik: string;
  npwp: string | null;
  jabatan: string | null;
  ptkpStatus: Ptkp;
  jenisKaryawan: Jenis;
  gajiPokok: string;
  tunjanganTetap: string;
  iuranBpjsKaryawan: string;
  isActive: boolean;
  cabang: { kode: string } | null;
}
interface Cabang { id: string; kode: string; nama: string }

const PTKP_LABEL: Record<Ptkp, string> = {
  TK_0: 'TK/0', TK_1: 'TK/1', TK_2: 'TK/2', TK_3: 'TK/3',
  K_0: 'K/0', K_1: 'K/1', K_2: 'K/2', K_3: 'K/3',
  HB_0: 'HB/0', HB_1: 'HB/1', HB_2: 'HB/2', HB_3: 'HB/3',
};

async function createKaryawan(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  try {
    await apiFetch('/karyawan', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        cabangId: (formData.get('cabangId') as string) || undefined,
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        nik: (formData.get('nik') as string)?.replace(/\D/g, ''),
        npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
        jabatan: formData.get('jabatan') || undefined,
        ptkpStatus: formData.get('ptkpStatus'),
        tanggalMasuk: formData.get('tanggalMasuk'),
        gajiPokok: String(formData.get('gajiPokok') ?? '0'),
        tunjanganTetap: String(formData.get('tunjanganTetap') ?? '0'),
        iuranBpjsKaryawan: String(formData.get('iuranBpjsKaryawan') ?? '0'),
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/pajak/karyawan');
  return { ok: true };
}

export default async function KaryawanPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [rows, cabang] = await Promise.all([
    apiFetch<Karyawan[]>('/karyawan', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
  ]);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Master Karyawan"
          subtitle={`${rows.length} karyawan · PTKP menentukan kategori TER PMK 168/2023 untuk PPh 21 bulanan.`}
          actions={
            <>
              <a href="/proxy/karyawan/export.xlsx" className={buttonClass('success')}>Export Excel</a>
              <ImportExcelButton importAction={importKaryawanAction} />
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama / Jabatan</TH>
                <TH>PTKP</TH>
                <TH>NPWP</TH>
                <TH numeric>Gaji Pokok</TH>
                <TH numeric stickyEnd className="w-16" />
              </THead>
              <TBody>
                {rows.map((k) => (
                  <TR key={k.id}>
                    <TD className="font-mono text-tanah-700">{k.kode}</TD>
                    <TD>
                      <div className="font-semibold text-tanah-700">{k.nama}</div>
                      <div className="text-xs text-tanah-500">{k.jabatan ?? '—'}</div>
                    </TD>
                    <TD>
                      <span className="font-mono text-xs bg-cream-100 text-tanah-700 px-2 py-0.5 rounded">
                        {PTKP_LABEL[k.ptkpStatus]}
                      </span>
                    </TD>
                    <TD className="font-mono text-xs text-tanah-500">
                      {k.npwp ? fmtNpwp(k.npwp) : <span className="text-bata-500">tanpa NPWP (+20%)</span>}
                    </TD>
                    <MoneyCell>{fmtRp(k.gajiPokok)}</MoneyCell>
                    <TD stickyEnd className="text-right">
                      <RowActions>
                        <Link href={`/pajak/karyawan/${k.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">
                          Edit
                        </Link>
                      </RowActions>
                    </TD>
                  </TR>
                ))}
                {rows.length === 0 && <EmptyRow colSpan={6}>Belum ada karyawan.</EmptyRow>}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Karyawan</h2>
            <KaryawanForm mode="create" action={createKaryawan} cabang={cabang} />
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
