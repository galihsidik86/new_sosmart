import Link from 'next/link';
import { Fragment } from 'react';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

interface Buckets {
  belumJatuh: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  above90: string;
}
interface Payment { id: string; nomor: string | null; tanggal: string; total: string }
interface InvoiceRow {
  id: string; nomor: string | null;
  tanggal: string; jatuhTempo: string;
  totalNetto: string; dibayar: string; sisa: string;
  daysOverdue: number;
  status: 'POSTED' | 'PARTIAL' | 'PAID';
  bucket: keyof Buckets;
  payments: Payment[];
}
interface Statement {
  asOf: string;
  customer: { id: string; kode: string; nama: string };
  totalSaldo: string;
  totalBuckets: Buckets;
  invoices: InvoiceRow[];
}

const BUCKET_LABEL: Record<keyof Buckets, string> = {
  belumJatuh: 'Belum Jatuh Tempo',
  b1_30: '1–30 hari',
  b31_60: '31–60 hari',
  b61_90: '61–90 hari',
  above90: '> 90 hari',
};

export default async function PiutangStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ asOf?: string; cabangId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { customerId } = await params;
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const asOf = sp.asOf ?? today;
  const cabangId = sp.cabangId ?? '';

  const st = await apiFetch<Statement>(
    `/reports/ar-statement?customerId=${customerId}&asOf=${asOf}${cabangId ? `&cabangId=${cabangId}` : ''}`,
    { tenantId },
  );

  const bucketKeys = Object.keys(BUCKET_LABEL) as (keyof Buckets)[];

  return (
    <>
      <Topbar breadcrumb={`Laporan / Piutang / ${st.customer.kode}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Link
              href={`/laporan/piutang?asOf=${asOf}${cabangId ? `&cabangId=${cabangId}` : ''}`}
              className="text-sm text-sogan-600 hover:underline"
            >
              ← Kembali ke daftar
            </Link>
            <h1 className="font-display text-3xl font-semibold text-wedel-900 mt-1">
              {st.customer.nama}
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Kode {st.customer.kode} · patokan {fmtTanggal(asOf)}
            </p>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-2">
              <a
                href={`/proxy/reports/ar-statement.xlsx?customerId=${customerId}&asOf=${asOf}${cabangId ? `&cabangId=${cabangId}` : ''}`}
                className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700 text-center"
              >
                Export Excel
              </a>
              <a
                href={`/proxy/reports/ar-statement.pdf?customerId=${customerId}&asOf=${asOf}${cabangId ? `&cabangId=${cabangId}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-bata-100 hover:bg-bata-200 border border-bata-300 rounded-lg text-sm font-semibold text-bata-700 text-center"
              >
                Preview PDF
              </a>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold">
                Total Saldo
              </div>
              <div className="text-2xl font-mono tabular-nums font-bold text-wedel-900">
                {fmtRp(st.totalSaldo)}
              </div>
            </div>
          </div>
        </div>

        <section className="bg-white rounded-xl border border-cream-200 shadow-sm mb-6 p-5">
          <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">
            Distribusi umur
          </div>
          <div className="grid grid-cols-5 gap-3">
            {bucketKeys.map((k) => (
              <div key={k} className="bg-cream-50 rounded-lg p-3 border border-cream-200">
                <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">
                  {BUCKET_LABEL[k]}
                </div>
                <div
                  className={`text-lg font-mono tabular-nums font-semibold mt-1 ${
                    k === 'above90' && Number(st.totalBuckets[k]) > 0 ? 'text-bata-700' : 'text-tanah-700'
                  }`}
                >
                  {fmtRp(st.totalBuckets[k])}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-cream-200 text-xs uppercase tracking-wider text-tanah-500 font-bold">
            Rincian Faktur &amp; Pembayaran
          </div>
          <table className="w-full text-sm">
            <thead className="bg-cream-50">
              <tr className="text-[10px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2 text-left w-36">Nomor</th>
                <th className="px-3 py-2 text-left w-24">Tanggal</th>
                <th className="px-3 py-2 text-left w-24">Jatuh Tempo</th>
                <th className="px-3 py-2 text-right w-20">Umur</th>
                <th className="px-3 py-2 text-right w-32">Netto</th>
                <th className="px-3 py-2 text-right w-32">Dibayar</th>
                <th className="px-3 py-2 text-right w-32">Sisa</th>
                <th className="px-3 py-2 text-left w-24">Bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {st.invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-tanah-400">
                    Tidak ada faktur outstanding.
                  </td>
                </tr>
              )}
              {st.invoices.map((inv) => (
                <Fragment key={inv.id}>
                  <tr className="hover:bg-cream-50">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/transaksi/penjualan/${inv.id}`}
                        className="text-sogan-600 hover:underline"
                      >
                        {inv.nomor ?? '—'}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-tanah-600">{fmtTanggal(inv.tanggal)}</td>
                    <td className="px-3 py-2 text-tanah-600">{fmtTanggal(inv.jatuhTempo)}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        inv.daysOverdue > 0 ? 'text-bata-700 font-semibold' : 'text-tanah-500'
                      }`}
                    >
                      {inv.daysOverdue > 0 ? `+${inv.daysOverdue}` : inv.daysOverdue} hr
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(inv.totalNetto)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-tanah-500">
                      {fmtRp(inv.dibayar)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                      {fmtRp(inv.sisa)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded ${
                          inv.bucket === 'above90'
                            ? 'bg-bata-100 text-bata-700'
                            : inv.bucket === 'belumJatuh'
                              ? 'bg-padi-100 text-padi-700'
                              : 'bg-cream-100 text-tanah-700'
                        }`}
                      >
                        {BUCKET_LABEL[inv.bucket]}
                      </span>
                    </td>
                  </tr>
                  {inv.payments.length > 0 &&
                    inv.payments.map((p) => (
                      <tr key={p.id} className="bg-cream-50/40 text-xs">
                        <td className="px-3 py-1 pl-6 text-tanah-500 font-mono">
                          ↳ {p.nomor ?? '—'}
                        </td>
                        <td className="px-3 py-1 text-tanah-500">{fmtTanggal(p.tanggal)}</td>
                        <td colSpan={3} className="px-3 py-1 text-tanah-400 italic">
                          pelunasan
                        </td>
                        <td className="px-3 py-1 text-right font-mono tabular-nums text-tanah-500">
                          ({fmtRp(p.total)})
                        </td>
                        <td colSpan={2} />
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
