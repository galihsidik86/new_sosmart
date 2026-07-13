import Link from 'next/link';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, StatusBadge, buttonClass, FilterLabel, DataTable } from '@/components/ui';
import { ListFilters, type FilterOption } from '@/components/ListFilters';
import { buildListHref } from '@/lib/list-query';

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
}: {
  searchParams: Promise<{ status?: Status; search?: string; cabangId?: string; projectId?: string; industriId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const apiParams = { status: sp.status, search: sp.search, cabangId: sp.cabangId, projectId: sp.projectId, industriId: sp.industriId };
  const [rows, cabang, projects, industri] = await Promise.all([
    apiFetch<Row[]>(buildListHref('/sales-invoices', apiParams), { tenantId }),
    apiFetch<FilterOption[]>('/cabang', { tenantId }).catch(() => [] as FilterOption[]),
    apiFetch<FilterOption[]>('/projects', { tenantId }).catch(() => [] as FilterOption[]),
    apiFetch<FilterOption[]>('/industri', { tenantId }).catch(() => [] as FilterOption[]),
  ]);
  const isPusat = ['OWNER', 'ADMIN', 'AKUNTAN'].includes(s.role ?? '');

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Faktur Penjualan"
          subtitle={`${rows.length} faktur · POST otomatis jurnal & buat piutang/penerimaan kas.`}
          actions={
            <>
              <a href={buildListHref('/proxy/sales-invoices/export.xlsx', apiParams)}
                className={buttonClass('success')}>
                Export Excel
              </a>
              <Link href="/transaksi/penjualan/baru" className={buttonClass('primary')}>
                + Faktur Baru
              </Link>
            </>
          }
        />

        <ListFilters
          action="/transaksi/penjualan"
          params={sp}
          cabang={isPusat && cabang.length > 1 ? cabang : undefined}
          projects={projects}
          industri={industri}
          searchPlaceholder="Cari no. faktur / pelanggan / keterangan…"
        />

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <FilterLabel>Status</FilterLabel>
          <div className="inline-flex p-1 bg-cream-200 rounded-lg gap-1 flex-wrap">
            {(['', 'DRAFT', 'POSTED', 'PARTIAL', 'PAID', 'CANCELLED'] as const).map((st) => {
              const active = (sp.status ?? '') === st;
              return (
                <Link
                  key={st || 'all'}
                  href={buildListHref('/transaksi/penjualan', sp, { status: st || undefined })}
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
