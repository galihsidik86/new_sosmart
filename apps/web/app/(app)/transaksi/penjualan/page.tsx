import Link from 'next/link';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, StatusBadge, buttonClass, FilterLabel, DataTable } from '@/components/ui';

type Status = 'DRAFT' | 'POSTED' | 'PAID' | 'PARTIAL' | 'CANCELLED';

interface Row {
  id: string;
  nomor: string | null;
  tanggal: string;
  jatuhTempo: string;
  status: Status;
  termin: 'TUNAI' | 'KREDIT';
  totalNetto: string;
  totalDibayar: string;
  linkBukti: string | null;
  customer: { kode: string; nama: string; isPkp: boolean };
  cabang: { kode: string };
  _count: { lines: number };
}

export default async function PenjualanPage({
  searchParams,
}: { searchParams: Promise<{ status?: Status }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const qs = sp.status ? `?status=${sp.status}` : '';
  const rows = await apiFetch<Row[]>(`/sales-invoices${qs}`, { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Faktur Penjualan"
          subtitle={`${rows.length} faktur · POST otomatis jurnal & buat piutang/penerimaan kas.`}
          actions={
            <>
              <a href={`/proxy/sales-invoices/export.xlsx${sp.status ? '?status=' + sp.status : ''}`}
                className={buttonClass('success')}>
                Export Excel
              </a>
              <Link href="/transaksi/penjualan/baru" className={buttonClass('primary')}>
                + Faktur Baru
              </Link>
            </>
          }
        />

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <FilterLabel>Status</FilterLabel>
          <div className="inline-flex p-1 bg-cream-200 rounded-lg gap-1 flex-wrap">
            {(['', 'DRAFT', 'POSTED', 'PARTIAL', 'PAID', 'CANCELLED'] as const).map((st) => {
              const active = (sp.status ?? '') === st;
              return (
                <Link
                  key={st || 'all'}
                  href={st ? `/transaksi/penjualan?status=${st}` : '/transaksi/penjualan'}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sogan-400 ${
                    active ? 'bg-white text-sogan-500 shadow-xs' : 'text-tanah-500 hover:text-tanah-700'
                  }`}
                >
                  {st || 'Semua'}
                </Link>
              );
            })}
          </div>
        </div>

        <DataTable
          rows={rows}
          getRowKey={(r) => r.id}
          empty="Belum ada faktur."
          columns={[
            {
              key: 'no', header: 'No / Tgl',
              cell: (r) => (
                <>
                  <Link href={`/transaksi/penjualan/${r.id}`} className="font-mono text-sogan-500 font-semibold hover:underline">
                    {r.nomor ?? '— draft —'}
                  </Link>
                  <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)} · {r.termin}</div>
                </>
              ),
            },
            {
              key: 'cust', header: 'Pelanggan',
              cell: (r) => (
                <>
                  <div className="font-semibold text-tanah-700">{r.customer.nama}</div>
                  <div className="text-xs text-tanah-500 font-mono">
                    {r.customer.kode} {r.customer.isPkp && <span className="text-padi-700 ml-1">PKP</span>}
                  </div>
                </>
              ),
            },
            { key: 'cab', header: 'Cabang', className: 'text-xs font-mono text-tanah-500', cell: (r) => r.cabang.kode },
            { key: 'jt', header: 'Jatuh Tempo', className: 'text-xs text-tanah-500', cell: (r) => fmtTanggal(r.jatuhTempo) },
            { key: 'total', header: 'Total', numeric: true, cell: (r) => fmtRp(r.totalNetto) },
            {
              key: 'sisa', header: 'Sisa', numeric: true, className: 'text-tanah-500',
              cell: (r) => {
                const sisa = Number(r.totalNetto) - Number(r.totalDibayar);
                return sisa > 0 ? fmtRp(sisa) : '✓';
              },
            },
            { key: 'bukti', header: 'Bukti', align: 'center', cell: (r) => <LinkBukti url={r.linkBukti} /> },
            { key: 'status', header: 'Status', align: 'center', cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </PageContainer>
    </>
  );
}
