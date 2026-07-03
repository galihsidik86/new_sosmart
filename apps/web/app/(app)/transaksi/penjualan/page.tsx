import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

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
      <Topbar breadcrumb="Penjualan" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Faktur Penjualan
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {rows.length} faktur · POST otomatis jurnal & buat piutang/penerimaan kas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/proxy/sales-invoices/export.xlsx${sp.status ? '?status=' + sp.status : ''}`}
              className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
              Export Excel
            </a>
            <Link href="/transaksi/penjualan/baru"
              className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              + Faktur Baru
            </Link>
          </div>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-2 shadow-sm text-sm">
          {(['', 'DRAFT', 'POSTED', 'PARTIAL', 'PAID', 'CANCELLED'] as const).map((st) => (
            <Link key={st || 'all'}
              href={st ? `/transaksi/penjualan?status=${st}` : '/transaksi/penjualan'}
              className={`px-3 py-1.5 rounded-md font-semibold ${
                (sp.status ?? '') === st
                  ? 'bg-sogan-500 text-cream-50'
                  : 'text-tanah-500 hover:bg-cream-50'
              }`}>
              {st || 'Semua'}
            </Link>
          ))}
        </form>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-4 py-3 font-bold">No / Tgl</th>
                <th className="px-4 py-3 font-bold">Pelanggan</th>
                <th className="px-4 py-3 font-bold">Cabang</th>
                <th className="px-4 py-3 font-bold">Jatuh Tempo</th>
                <th className="px-4 py-3 font-bold text-right">Total</th>
                <th className="px-4 py-3 font-bold text-right">Sisa</th>
                <th className="px-4 py-3 font-bold text-center">Bukti</th>
                <th className="px-4 py-3 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {rows.map((r) => {
                const sisa = Number(r.totalNetto) - Number(r.totalDibayar);
                return (
                  <tr key={r.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/transaksi/penjualan/${r.id}`}
                        className="font-mono text-sogan-500 font-semibold hover:underline">
                        {r.nomor ?? '— draft —'}
                      </Link>
                      <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)} · {r.termin}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-tanah-700">{r.customer.nama}</div>
                      <div className="text-xs text-tanah-500 font-mono">
                        {r.customer.kode} {r.customer.isPkp && <span className="text-padi-700 ml-1">PKP</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-tanah-500">{r.cabang.kode}</td>
                    <td className="px-4 py-2.5 text-xs text-tanah-500">{fmtTanggal(r.jatuhTempo)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtRp(r.totalNetto)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-tanah-500">
                      {sisa > 0 ? fmtRp(sisa) : '✓'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <LinkBukti url={r.linkBukti} />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-tanah-500">Belum ada faktur.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const m = {
    DRAFT: 'bg-emas-100 text-emas-700',
    POSTED: 'bg-padi-100 text-padi-700',
    PARTIAL: 'bg-sogan-50 text-sogan-500',
    PAID: 'bg-padi-300 text-padi-700',
    CANCELLED: 'bg-cream-200 text-tanah-500 line-through',
  }[status];
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${m}`}>
      {status}
    </span>
  );
}
