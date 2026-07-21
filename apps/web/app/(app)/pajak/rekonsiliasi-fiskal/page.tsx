import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, SectionHeader, FormField, Input, Select, Button,
  MoneyInput, Table, THead, TH, TBody, TR, TD, EmptyRow, buttonClass, FilterLabel, filterBarClass,
} from '@/components/ui';
import { fmtPlain } from '@/lib/format';

interface PeriodYear { id: string; kode: string }
interface PphSetting {
  skema: string; peredaranBruto: string; useFasilitas31E: boolean; tarif: string; kreditPajakManual: string;
}
interface Kompensasi { id: string; tahunRugi: string; nilaiRugi: string; dipakai: string }
interface Koreksi {
  id: string; jenis: string; beda: string; kategori: string; deskripsi: string; koreksi: string; catatan: string | null;
}

const KAT = ['NATURA','ENTERTAINMENT','SUMBANGAN','SANKSI_PAJAK','PENGHASILAN_FINAL','BUNGA','SEWA','PENYUSUTAN','CADANGAN','LAINNYA'];
const PATH = '/pajak/rekonsiliasi-fiskal';

export default async function KelolaRekonFiskalPage({
  searchParams,
}: {
  searchParams: Promise<{ fiscalYearId?: string }>;
}) {
  await getSession();
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const fyId = sp.fiscalYearId || years[0]?.id;

  const [setting, kompensasi, koreksi] = fyId
    ? await Promise.all([
        apiFetch<PphSetting | null>(`/fiskal/pph-setting?fiscalYearId=${fyId}`, { tenantId }).catch(() => null),
        apiFetch<Kompensasi[]>(`/fiskal/kompensasi?fiscalYearId=${fyId}`, { tenantId }).catch(() => []),
        apiFetch<Koreksi[]>(`/fiskal/koreksi?fiscalYearId=${fyId}`, { tenantId }).catch(() => []),
      ])
    : [null, [] as Kompensasi[], [] as Koreksi[]];

  // ----- server actions -----
  async function savePph(formData: FormData) {
    'use server';
    const tid = await getActiveTenantId(); if (!tid) redirect('/login');
    await apiFetch('/fiskal/pph-setting', {
      method: 'PUT', tenantId: tid,
      body: JSON.stringify({
        fiscalYearId: String(formData.get('fiscalYearId')),
        skema: String(formData.get('skema')),
        peredaranBruto: String(formData.get('peredaranBruto') ?? '0'),
        useFasilitas31E: formData.get('useFasilitas31E') === 'on',
        tarif: String(formData.get('tarif') ?? '22'),
        kreditPajakManual: String(formData.get('kreditPajakManual') ?? '0'),
      }),
    });
    revalidatePath(PATH);
  }
  async function saveKompensasi(formData: FormData) {
    'use server';
    const tid = await getActiveTenantId(); if (!tid) redirect('/login');
    const tahun = formData.getAll('tahunRugi') as string[];
    const rugi = formData.getAll('nilaiRugi') as string[];
    const pakai = formData.getAll('dipakai') as string[];
    const items = tahun
      .map((t, i) => ({ tahunRugi: t.trim(), nilaiRugi: rugi[i] || '0', dipakai: pakai[i] || '0' }))
      .filter((it) => /^\d{4}$/.test(it.tahunRugi) && Number(it.nilaiRugi) > 0);
    await apiFetch('/fiskal/kompensasi', {
      method: 'PUT', tenantId: tid,
      body: JSON.stringify({ fiscalYearId: String(formData.get('fiscalYearId')), items }),
    });
    revalidatePath(PATH);
  }
  async function addKoreksi(formData: FormData) {
    'use server';
    const tid = await getActiveTenantId(); if (!tid) redirect('/login');
    await apiFetch('/fiskal/koreksi', {
      method: 'POST', tenantId: tid,
      body: JSON.stringify({
        fiscalYearId: String(formData.get('fiscalYearId')),
        jenis: String(formData.get('jenis')),
        beda: String(formData.get('beda')),
        kategori: String(formData.get('kategori')),
        deskripsi: String(formData.get('deskripsi')),
        koreksi: String(formData.get('koreksi') ?? '0'),
        catatan: (formData.get('catatan') as string) || null,
      }),
    });
    revalidatePath(PATH);
  }
  async function delKoreksi(formData: FormData) {
    'use server';
    const tid = await getActiveTenantId(); if (!tid) redirect('/login');
    await apiFetch(`/fiskal/koreksi/${String(formData.get('id'))}`, { method: 'DELETE', tenantId: tid });
    revalidatePath(PATH);
  }

  // 5 baris kompensasi (isi existing + kosong).
  const komRows = Array.from({ length: 5 }, (_, i) => kompensasi[i]);

  return (
    <PageContainer size="form">
      <PageHeader
        title="Kelola Rekonsiliasi Fiskal"
        subtitle="Parameter PPh Badan, kompensasi kerugian, dan koreksi fiskal manual per tahun."
        actions={<Link href="/laporan/rekonsiliasi-fiskal" className={buttonClass('secondary')}>Lihat worksheet</Link>}
      />

      <form className={filterBarClass}>
        <div><FilterLabel>Tahun Fiskal</FilterLabel>
          <Select name="fiscalYearId" defaultValue={fyId}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.kode}</option>)}
          </Select>
        </div>
        <Button type="submit" className="self-end">Pilih</Button>
      </form>

      {/* PPh setting */}
      <Card className="mt-4">
        <SectionHeader className="mb-3">Parameter PPh Badan</SectionHeader>
        <form action={savePph} className="space-y-3 text-sm">
          <input type="hidden" name="fiscalYearId" value={fyId} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Skema">
              <Select name="skema" defaultValue={setting?.skema ?? 'BADAN_UMUM'}>
                <option value="BADAN_UMUM">Badan Umum (22% + Ps.31E)</option>
                <option value="UMKM_FINAL">UMKM Final 0,5% (PP 55/2022)</option>
              </Select>
            </FormField>
            <FormField label="Tarif badan umum (%)"><Input name="tarif" type="number" defaultValue={setting?.tarif ?? '22'} /></FormField>
            <FormField label="Peredaran bruto setahun"><MoneyInput name="peredaranBruto" defaultValue={setting?.peredaranBruto ?? '0'} /></FormField>
            <FormField label="Kredit pajak (PPh 22/23/25)"><MoneyInput name="kreditPajakManual" defaultValue={setting?.kreditPajakManual ?? '0'} /></FormField>
          </div>
          <label className="flex items-center gap-2 text-tanah-700">
            <input type="checkbox" name="useFasilitas31E" defaultChecked={setting?.useFasilitas31E ?? true} />
            Pakai fasilitas Pasal 31E (bruto ≤ 50 M)
          </label>
          <Button type="submit" size="sm">Simpan parameter PPh</Button>
        </form>
      </Card>

      {/* Kompensasi kerugian */}
      <Card className="mt-4">
        <SectionHeader className="mb-3">Kompensasi Kerugian (maks 5 tahun)</SectionHeader>
        <form action={saveKompensasi} className="space-y-2 text-sm">
          <input type="hidden" name="fiscalYearId" value={fyId} />
          <div className="grid grid-cols-[6rem_1fr_1fr] gap-2 text-[11px] uppercase tracking-wide text-tanah-500 font-bold px-1">
            <span>Tahun rugi</span><span>Nilai rugi</span><span>Dipakai tahun ini</span>
          </div>
          {komRows.map((k, i) => (
            <div key={i} className="grid grid-cols-[6rem_1fr_1fr] gap-2 items-center">
              <Input name="tahunRugi" placeholder="2023" defaultValue={k?.tahunRugi ?? ''} />
              <MoneyInput name="nilaiRugi" defaultValue={k?.nilaiRugi ?? ''} />
              <MoneyInput name="dipakai" defaultValue={k?.dipakai ?? ''} />
            </div>
          ))}
          <Button type="submit" size="sm" variant="secondary">Simpan kompensasi</Button>
          <p className="text-[11px] text-tanah-500">Baris tanpa tahun (4 digit) &amp; nilai rugi diabaikan. Menyimpan akan mengganti seluruh daftar.</p>
        </form>
      </Card>

      {/* Koreksi manual */}
      <Card className="mt-4">
        <SectionHeader className="mb-3">Koreksi Fiskal Manual</SectionHeader>
        <Table>
          <THead>
            <TH>Deskripsi</TH><TH>Jenis</TH><TH>Kategori</TH><TH numeric>Nilai</TH><TH className="w-16" />
          </THead>
          <TBody>
            {koreksi.map((k) => (
              <TR key={k.id}>
                <TD>{k.deskripsi}{k.catatan ? <span className="block text-[10px] text-tanah-500">{k.catatan}</span> : null}</TD>
                <TD>{k.jenis === 'POSITIF' ? <span className="text-bata-700">Positif (+)</span> : <span className="text-padi-700">Negatif (−)</span>} <span className="text-[10px] text-tanah-500">{k.beda === 'TETAP' ? 'tetap' : 'sementara'}</span></TD>
                <TD className="text-xs text-tanah-500">{k.kategori}</TD>
                <TD numeric className="font-mono tabular-nums">{fmtPlain(k.koreksi)}</TD>
                <TD className="text-right">
                  <form action={delKoreksi}>
                    <input type="hidden" name="id" value={k.id} />
                    <button type="submit" className="text-xs text-bata-600 hover:underline">Hapus</button>
                  </form>
                </TD>
              </TR>
            ))}
            {koreksi.length === 0 && <EmptyRow colSpan={5}>Belum ada koreksi manual.</EmptyRow>}
          </TBody>
        </Table>

        <form action={addKoreksi} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t border-cream-200 pt-4">
          <input type="hidden" name="fiscalYearId" value={fyId} />
          <FormField label="Deskripsi"><Input name="deskripsi" required placeholder="mis. Beban jamuan tanpa daftar nominatif" /></FormField>
          <FormField label="Nilai koreksi"><MoneyInput name="koreksi" defaultValue="0" /></FormField>
          <FormField label="Jenis">
            <Select name="jenis" defaultValue="POSITIF">
              <option value="POSITIF">Positif (+) — menambah PKP</option>
              <option value="NEGATIF">Negatif (−) — mengurangi PKP</option>
            </Select>
          </FormField>
          <FormField label="Beda">
            <Select name="beda" defaultValue="TETAP">
              <option value="TETAP">Tetap (permanen)</option>
              <option value="SEMENTARA">Sementara (waktu)</option>
            </Select>
          </FormField>
          <FormField label="Kategori">
            <Select name="kategori" defaultValue="LAINNYA">
              {KAT.map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </FormField>
          <FormField label="Catatan (opsional)"><Input name="catatan" /></FormField>
          <div className="sm:col-span-2"><Button type="submit" size="sm">+ Tambah koreksi</Button></div>
        </form>
      </Card>
    </PageContainer>
  );
}
