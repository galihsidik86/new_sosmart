import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Badge, buttonClass, filterBarClass,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow, type BadgeVariant,
} from '@/components/ui';

type Status = 'AKTIF' | 'DIJUAL' | 'RUSAK' | 'PENSIUN';
type Kelompok =
  | 'BANGUNAN_PERMANEN' | 'BANGUNAN_NON_PERMANEN'
  | 'KELOMPOK_I' | 'KELOMPOK_II' | 'KELOMPOK_III' | 'KELOMPOK_IV';
type Metode = 'GARIS_LURUS' | 'SALDO_MENURUN';

interface Row {
  id: string;
  kode: string;
  nama: string;
  kelompok: Kelompok;
  metode: Metode;
  tanggalPerolehan: string;
  hargaPerolehan: string;
  akumulasiPenyusutan: string;
  nilaiBuku: string;
  masaManfaatBulan: number;
  status: Status;
  lastDepresiasiPeriode: string | null;
  cabang: { kode: string };
}

const KELOMPOK_LABEL: Record<Kelompok, string> = {
  BANGUNAN_PERMANEN: 'Bangunan Permanen (20 thn)',
  BANGUNAN_NON_PERMANEN: 'Bangunan Non-Permanen (10 thn)',
  KELOMPOK_I: 'Kelompok I (4 thn)',
  KELOMPOK_II: 'Kelompok II (8 thn)',
  KELOMPOK_III: 'Kelompok III (16 thn)',
  KELOMPOK_IV: 'Kelompok IV (20 thn)',
};

const STATUS_VARIANT: Record<Status, BadgeVariant> = {
  AKTIF: 'success',
  DIJUAL: 'neutral',
  RUSAK: 'danger',
  PENSIUN: 'neutral',
};

export default async function AsetDaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Status }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const qs = sp.status ? `?status=${sp.status}` : '';
  const rows = await apiFetch<Row[]>(`/aset${qs}`, { tenantId });

  const totalNilai = rows
    .filter((r) => r.status === 'AKTIF')
    .reduce((a, r) => a + Number(r.nilaiBuku), 0);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Aset Tetap"
          subtitle={
            <>
              {rows.length} aset · total nilai buku AKTIF:{' '}
              <span className="font-semibold text-tanah-700">{fmtRp(totalNilai)}</span>
            </>
          }
          actions={
            <>
              <a href="/proxy/aset/export.xlsx" className={buttonClass('success')}>
                Export Excel
              </a>
              <Link href="/aset/baru" className={buttonClass('primary')}>
                + Aset Baru
              </Link>
            </>
          }
        />

        <form className={filterBarClass}>
          {(['', 'AKTIF', 'DIJUAL', 'RUSAK', 'PENSIUN'] as const).map((st) => (
            <Link key={st || 'all'}
              href={st ? `/aset/daftar?status=${st}` : '/aset/daftar'}
              className={`px-3 py-1.5 rounded-md font-semibold ${
                (sp.status ?? '') === st ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'
              }`}>
              {st || 'Semua'}
            </Link>
          ))}
        </form>

        <Table>
          <THead>
            <TH>Kode</TH>
            <TH>Nama / Kelompok</TH>
            <TH>Perolehan</TH>
            <TH numeric>Harga Perolehan</TH>
            <TH numeric>Akumulasi</TH>
            <TH numeric>Nilai Buku</TH>
            <TH className="text-center">Status</TH>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/aset/${r.id}`} className="font-mono text-sogan-500 font-semibold hover:underline">
                    {r.kode}
                  </Link>
                  <div className="text-xs text-tanah-500">{r.cabang.kode}</div>
                </TD>
                <TD>
                  <div className="font-semibold text-tanah-700">{r.nama}</div>
                  <div className="text-xs text-tanah-500">
                    {KELOMPOK_LABEL[r.kelompok]} · {r.metode === 'GARIS_LURUS' ? 'Garis Lurus' : 'Saldo Menurun'}
                  </div>
                </TD>
                <TD className="text-xs text-tanah-500">{fmtTanggal(r.tanggalPerolehan)}</TD>
                <MoneyCell>{fmtRp(r.hargaPerolehan)}</MoneyCell>
                <MoneyCell className="text-bata-700">{fmtRp(r.akumulasiPenyusutan)}</MoneyCell>
                <MoneyCell className="font-semibold">{fmtRp(r.nilaiBuku)}</MoneyCell>
                <TD className="text-center">
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                </TD>
              </TR>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={7}>Belum ada aset.</EmptyRow>}
          </TBody>
        </Table>
      </PageContainer>
    </>
  );
}
