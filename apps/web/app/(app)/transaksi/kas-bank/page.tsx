import Link from 'next/link';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, StatusBadge, Badge, buttonClass, FilterLabel, DataTable, type BadgeVariant } from '@/components/ui';
import { LiveRefresh } from '@/components/LiveRefresh';
import { ListFilters, type FilterOption } from '@/components/ListFilters';
import { buildListHref } from '@/lib/list-query';

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
}: {
  searchParams: Promise<{ tipe?: Tipe; search?: string; cabangId?: string; projectId?: string; industriId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const apiParams = { tipe: sp.tipe, search: sp.search, cabangId: sp.cabangId, projectId: sp.projectId, industriId: sp.industriId };
  const [rows, cabang, projects, industri] = await Promise.all([
    apiFetch<Row[]>(buildListHref('/cash-bank', apiParams), { tenantId }),
    apiFetch<FilterOption[]>('/cabang', { tenantId }).catch(() => [] as FilterOption[]),
    apiFetch<FilterOption[]>('/projects', { tenantId }).catch(() => [] as FilterOption[]),
    apiFetch<FilterOption[]>('/industri', { tenantId }).catch(() => [] as FilterOption[]),
  ]);
  const isPusat = ['OWNER', 'ADMIN', 'AKUNTAN'].includes(s.role ?? '');

  return (
    <>
      <LiveRefresh intervalMs={8000} />
      <PageContainer size="list">
        <PageHeader
          title="Bukti Kas & Bank"
          subtitle="BKM/BKK untuk kas keluar-masuk · BMT untuk mutasi antar akun · pelunasan AR/AP otomatis update status faktur."
          actions={
            <>
              <a href={buildListHref('/proxy/cash-bank/export.xlsx', apiParams)}
                className={buttonClass('success')}>
                Export Excel
              </a>
              <Link href="/transaksi/kas-bank/baru" className={buttonClass('primary')}>
                + Bukti Baru
              </Link>
            </>
          }
        />

        <ListFilters
          action="/transaksi/kas-bank"
          params={sp}
          cabang={isPusat && cabang.length > 1 ? cabang : undefined}
          projects={projects}
          industri={industri}
          searchPlaceholder="Cari no. bukti / kontak / deskripsi…"
        />

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <FilterLabel>Tipe</FilterLabel>
          <div className="inline-flex p-1 bg-cream-200 rounded-lg gap-1 flex-wrap">
            {(['', 'RECEIPT', 'PAYMENT', 'TRANSFER'] as const).map((t) => {
              const active = (sp.tipe ?? '') === t;
              return (
                <Link
                  key={t || 'all'}
                  href={buildListHref('/transaksi/kas-bank', sp, { tipe: t || undefined })}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sogan-400 ${
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
