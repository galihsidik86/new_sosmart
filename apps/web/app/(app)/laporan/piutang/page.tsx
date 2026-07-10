import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { ReportActions } from '@/components/ReportActions';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, FilterLabel, Select, Button, filterBarClass } from '@/components/ui';

interface Cabang { id: string; kode: string; nama: string }

interface Buckets {
  belumJatuh: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  above90: string;
}
interface Row {
  customerId: string;
  kode: string;
  nama: string;
  saldo: string;
  buckets: Buckets;
  jumlahFaktur: number;
}
interface AR {
  asOf: string;
  cabangId?: string;
  totalSaldo: string;
  totalBuckets: Buckets;
  rows: Row[];
}

const BUCKET_LABEL: Record<keyof Buckets, string> = {
  belumJatuh: 'Belum Jatuh Tempo',
  b1_30: '1–30 hari',
  b31_60: '31–60 hari',
  b61_90: '61–90 hari',
  above90: '> 90 hari',
};

export default async function PiutangPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; cabangId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const asOf = sp.asOf ?? today;
  const cabangId = sp.cabangId ?? '';

  const [cabang, ar] = await Promise.all([
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<AR>(
      `/reports/ar-aging?asOf=${asOf}${cabangId ? `&cabangId=${cabangId}` : ''}`,
      { tenantId },
    ),
  ]);

  const bucketKeys = Object.keys(BUCKET_LABEL) as (keyof Buckets)[];

  return (
    <>
      <Topbar breadcrumb="Laporan / Piutang" tenantNama={s.tenantNama!} />
      <PageContainer size="list">
        <PageHeader
          title="Aging Piutang Usaha"
          subtitle="Saldo piutang per pelanggan · umur dihitung dari jatuh tempo · pembayaran ≤ tanggal patokan."
          actions={
            <ReportActions
              xlsx={`/proxy/reports/ar-aging.xlsx?asOf=${asOf}${cabangId ? `&cabangId=${cabangId}` : ''}`}
              pdf={`/proxy/reports/ar-aging.pdf?asOf=${asOf}${cabangId ? `&cabangId=${cabangId}` : ''}`}
            />
          }
        />

        <form method="GET" className={filterBarClass}>
          <FilterLabel>Tanggal patokan (asOf)</FilterLabel>
          <input
            type="date"
            name="asOf"
            defaultValue={asOf}
            required
            className="px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
          />
          <FilterLabel>Cabang</FilterLabel>
          <Select name="cabangId" defaultValue={cabangId} fullWidth={false}>
            <option value="">Semua cabang</option>
            {cabang.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kode} — {c.nama}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Terapkan</Button>
        </form>

        <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-cream-200 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold">
              Ringkasan per Pelanggan · patokan {fmtTanggal(asOf)}
            </div>
            <div className="text-sm text-tanah-700">
              Total saldo:{' '}
              <span className="font-mono tabular-nums font-bold text-base">
                {fmtRp(ar.totalSaldo)}
              </span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-cream-50">
              <tr className="text-[10px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2 text-left">Pelanggan</th>
                <th className="px-3 py-2 text-right w-16">Faktur</th>
                {bucketKeys.map((k) => (
                  <th key={k} className="px-3 py-2 text-right w-32">
                    {BUCKET_LABEL[k]}
                  </th>
                ))}
                <th className="px-3 py-2 text-right w-36">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {ar.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-tanah-400">
                    Tidak ada saldo piutang pada tanggal ini.
                  </td>
                </tr>
              )}
              {ar.rows.map((r) => (
                <tr key={r.customerId} className="hover:bg-cream-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/laporan/piutang/${r.customerId}?asOf=${asOf}${cabangId ? `&cabangId=${cabangId}` : ''}`}
                      className="text-sogan-600 hover:underline font-medium"
                    >
                      {r.kode} — {r.nama}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-tanah-500 tabular-nums">
                    {r.jumlahFaktur}
                  </td>
                  {bucketKeys.map((k) => (
                    <td
                      key={k}
                      className={`px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap ${
                        k === 'above90' && Number(r.buckets[k]) > 0
                          ? 'text-bata-700 font-semibold'
                          : ''
                      }`}
                    >
                      {Number(r.buckets[k]) > 0 ? fmtRp(r.buckets[k]) : '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                    {fmtRp(r.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
            {ar.rows.length > 0 && (
              <tfoot className="bg-cream-50 font-bold">
                <tr>
                  <td className="px-3 py-2 text-tanah-700">TOTAL</td>
                  <td />
                  {bucketKeys.map((k) => (
                    <td key={k} className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {fmtRp(ar.totalBuckets[k])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {fmtRp(ar.totalSaldo)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      </PageContainer>
    </>
  );
}
