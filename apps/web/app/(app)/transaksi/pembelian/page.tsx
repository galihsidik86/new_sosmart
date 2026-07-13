import Link from 'next/link';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, StatusBadge, buttonClass, FilterLabel, DataTable } from '@/components/ui';
import { ListFilters, type FilterOption } from '@/components/ListFilters';
import { buildListHref } from '@/lib/list-query';

type Status = 'DRAFT' | 'POSTED' | 'PARTIAL' | 'PAID' | 'CANCELLED';

interface Row {
  id: string;
  nomor: string | null;
  nomorVendor: string | null;
  tanggal: string;
  jatuhTempo: string;
  status: Status;
  termin: 'TUNAI' | 'KREDIT';
  totalNetto: string;
  totalDibayar: string;
  linkBukti: string | null;
  vendor: { kode: string; nama: string; isPkp: boolean };
  cabang: { kode: string };
}

export default async function PembelianPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Status; search?: string; cabangId?: string; projectId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const apiParams = { status: sp.status, search: sp.search, cabangId: sp.cabangId, projectId: sp.projectId };
  const [rows, cabang, projects] = await Promise.all([
    apiFetch<Row[]>(buildListHref('/purchase-invoices', apiParams), { tenantId }),
    apiFetch<FilterOption[]>('/cabang', { tenantId }).catch(() => [] as FilterOption[]),
    apiFetch<FilterOption[]>('/projects', { tenantId }).catch(() => [] as FilterOption[]),
  ]);
  const isPusat = ['OWNER', 'ADMIN', 'AKUNTAN'].includes(s.role ?? '');

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Tagihan Pembelian"
          subtitle={`${rows.length} tagihan · vendor PKP → PPN masukan dikreditkan; jasa → potong PPh 23.`}
          actions={
            <>
              <a href={buildListHref('/proxy/purchase-invoices/export.xlsx', apiParams)}
                className={buttonClass('success')}>
                Export Excel
              </a>
              <Link href="/transaksi/pembelian/baru" className={buttonClass('primary')}>
                + Tagihan Baru
              </Link>
            </>
          }
        />

        <ListFilters
          action="/transaksi/pembelian"
          params={sp}
          cabang={isPusat && cabang.length > 1 ? cabang : undefined}
          projects={projects}
          searchPlaceholder="Cari no. tagihan / faktur vendor / vendor…"
        />

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <FilterLabel>Status</FilterLabel>
          <div className="inline-flex p-1 bg-cream-200 rounded-lg gap-1 flex-wrap">
            {(['', 'DRAFT', 'POSTED', 'PARTIAL', 'PAID', 'CANCELLED'] as const).map((st) => {
              const active = (sp.status ?? '') === st;
              return (
                <Link
                  key={st || 'all'}
                  href={buildListHref('/transaksi/pembelian', sp, { status: st || undefined })}
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
          empty="Belum ada tagihan."
          columns={[
            {
              key: 'no', header: 'No / Tgl',
              cell: (r) => (
                <>
                  <Link href={`/transaksi/pembelian/${r.id}`} className="font-mono text-sogan-500 font-semibold hover:underline">
                    {r.nomor ?? '— draft —'}
                  </Link>
                  <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)} · {r.termin}</div>
                </>
              ),
            },
            {
              key: 'vendor', header: 'Vendor',
              cell: (r) => (
                <>
                  <div className="font-semibold text-tanah-700">{r.vendor.nama}</div>
                  <div className="text-xs text-tanah-500 font-mono">
                    {r.vendor.kode} {r.vendor.isPkp && <span className="text-padi-700 ml-1">PKP</span>}
                  </div>
                </>
              ),
            },
            { key: 'nfv', header: 'No Faktur Vendor', className: 'text-xs text-tanah-500 font-mono', cell: (r) => r.nomorVendor ?? '—' },
            { key: 'jt', header: 'Jatuh Tempo', className: 'text-xs text-tanah-500', cell: (r) => fmtTanggal(r.jatuhTempo) },
            { key: 'total', header: 'Yg Dibayar', numeric: true, cell: (r) => fmtRp(r.totalNetto) },
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
