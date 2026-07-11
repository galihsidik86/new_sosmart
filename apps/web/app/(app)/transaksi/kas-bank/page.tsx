import Link from 'next/link';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, StatusBadge, Badge, buttonClass, FilterLabel, DataTable, type BadgeVariant } from '@/components/ui';

type Tipe = 'RECEIPT' | 'PAYMENT' | 'TRANSFER';
type Status = 'DRAFT' | 'POSTED' | 'CANCELLED';

interface Row {
  id: string;
  nomor: string | null;
  tanggal: string;
  tipe: Tipe;
  status: Status;
  kontak: string | null;
  deskripsi: string | null;
  linkBukti: string | null;
  total: string;
  akunKasBank: { kode: string; nama: string };
  cabang: { kode: string };
}

const TIPE_BADGE: Record<Tipe, BadgeVariant> = {
  RECEIPT: 'success',
  PAYMENT: 'danger',
  TRANSFER: 'neutral',
};

export default async function KasBankPage({
  searchParams,
}: { searchParams: Promise<{ tipe?: Tipe }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const qs = sp.tipe ? `?tipe=${sp.tipe}` : '';
  const rows = await apiFetch<Row[]>(`/cash-bank${qs}`, { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Bukti Kas & Bank"
          subtitle="BKM/BKK untuk kas keluar-masuk · BMT untuk mutasi antar akun · pelunasan AR/AP otomatis update status faktur."
          actions={
            <>
              <a href={`/proxy/cash-bank/export.xlsx${sp.tipe ? '?tipe=' + sp.tipe : ''}`}
                className={buttonClass('success')}>
                Export Excel
              </a>
              <Link href="/transaksi/kas-bank/baru" className={buttonClass('primary')}>
                + Bukti Baru
              </Link>
            </>
          }
        />

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <FilterLabel>Tipe</FilterLabel>
          <div className="inline-flex p-1 bg-cream-200 rounded-lg gap-1 flex-wrap">
            {(['', 'RECEIPT', 'PAYMENT', 'TRANSFER'] as const).map((t) => {
              const active = (sp.tipe ?? '') === t;
              return (
                <Link
                  key={t || 'all'}
                  href={t ? `/transaksi/kas-bank?tipe=${t}` : '/transaksi/kas-bank'}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                    active ? 'bg-white text-sogan-500 shadow-xs' : 'text-tanah-500 hover:text-tanah-700'
                  }`}
                >
                  {t || 'Semua'}
                </Link>
              );
            })}
          </div>
        </div>

        <DataTable
          rows={rows}
          getRowKey={(r) => r.id}
          empty="Belum ada transaksi."
          columns={[
            {
              key: 'no', header: 'No / Tgl',
              cell: (r) => (
                <>
                  <Link href={`/transaksi/kas-bank/${r.id}`} className="font-mono text-sogan-500 font-semibold hover:underline">
                    {r.nomor ?? '— draft —'}
                  </Link>
                  <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)} · {r.cabang.kode}</div>
                </>
              ),
            },
            { key: 'tipe', header: 'Tipe', cell: (r) => <Badge variant={TIPE_BADGE[r.tipe]}>{r.tipe}</Badge> },
            { key: 'akun', header: 'Akun Kas/Bank', className: 'text-xs font-mono text-tanah-500', cell: (r) => `${r.akunKasBank.kode} ${r.akunKasBank.nama}` },
            {
              key: 'kontak', header: 'Kontak / Deskripsi',
              cell: (r) => (
                <>
                  <div className="text-tanah-700 text-sm">{r.kontak ?? '—'}</div>
                  <div className="text-xs text-tanah-500">{r.deskripsi}</div>
                </>
              ),
            },
            { key: 'nilai', header: 'Nilai', numeric: true, cell: (r) => fmtRp(r.total) },
            { key: 'bukti', header: 'Bukti', align: 'center', cell: (r) => <LinkBukti url={r.linkBukti} /> },
            { key: 'status', header: 'Status', align: 'center', cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </PageContainer>
    </>
  );
}
