import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

type Status = 'DRAFT' | 'POSTED' | 'REVERSED';
type Sumber =
  | 'MANUAL' | 'PENJUALAN' | 'RETUR_JUAL' | 'PEMBELIAN' | 'RETUR_BELI'
  | 'KAS_BANK' | 'PENYUSUTAN' | 'PENYESUAIAN' | 'TUTUP_BUKU' | 'PAJAK';

interface JurnalRow {
  id: string;
  nomor: string | null;
  tanggal: string;
  deskripsi: string;
  linkBukti: string | null;
  status: Status;
  sumber: Sumber;
  totalDebit: string;
  totalKredit: string;
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  _count: { lines: number };
}
interface PeriodYear {
  id: string;
  kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}

export default async function JurnalPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; status?: Status }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const currentPeriod =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id;

  const qs = new URLSearchParams();
  if (currentPeriod) qs.set('periodId', currentPeriod);
  if (sp.status) qs.set('status', sp.status);
  const jurnals = await apiFetch<JurnalRow[]>(
    `/journals${qs.toString() ? '?' + qs : ''}`,
    { tenantId },
  );

  return (
    <>
      <Topbar breadcrumb="Jurnal Umum" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Jurnal Umum
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {jurnals.length} jurnal · invariant debit = kredit dipaksakan di DB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/proxy/journals/export.xlsx${qs.toString() ? '?' + qs : ''}`}
              className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700"
            >
              Export Excel
            </a>
            <Link
              href="/pembukuan/jurnal/baru"
              className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm"
            >
              + Jurnal Baru
            </Link>
          </div>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-4 mb-6 flex items-end gap-4 shadow-sm">
          <div className="flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Periode
            </label>
            <select
              name="periodId"
              defaultValue={currentPeriod}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
            >
              {years[0]?.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.status})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Status
            </label>
            <select
              name="status"
              defaultValue={sp.status ?? ''}
              className="px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
            >
              <option value="">Semua</option>
              <option value="DRAFT">DRAFT</option>
              <option value="POSTED">POSTED</option>
              <option value="REVERSED">REVERSED</option>
            </select>
          </div>
          <button className="px-3 py-2 bg-cream-200 border border-cream-400 rounded-md text-sm font-semibold text-tanah-700">
            Terapkan
          </button>
        </form>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-4 py-3 font-bold">No / Tgl</th>
                <th className="px-4 py-3 font-bold">Deskripsi</th>
                <th className="px-4 py-3 font-bold">Sumber</th>
                <th className="px-4 py-3 font-bold">Cabang</th>
                <th className="px-4 py-3 font-bold text-right">Total</th>
                <th className="px-4 py-3 font-bold text-center">Bukti</th>
                <th className="px-4 py-3 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {jurnals.map((j) => (
                <tr key={j.id} className="hover:bg-cream-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/pembukuan/jurnal/${j.id}`}
                      className="font-mono text-sogan-500 font-semibold hover:underline"
                    >
                      {j.nomor ?? '— draft —'}
                    </Link>
                    <div className="text-xs text-tanah-500">
                      {fmtTanggal(j.tanggal)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-tanah-700">{j.deskripsi}</div>
                    <div className="text-xs text-tanah-500">
                      {j._count.lines} baris · {j.fiscalPeriod.label}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-tanah-500">{j.sumber}</td>
                  <td className="px-4 py-2.5 text-xs text-tanah-500 font-mono">
                    {j.cabang.kode}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {fmtRp(j.totalDebit)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <LinkBukti url={j.linkBukti} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge status={j.status} />
                  </td>
                </tr>
              ))}
              {jurnals.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-tanah-500">
                    Belum ada jurnal di periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map = {
    DRAFT: { bg: 'bg-emas-100', text: 'text-emas-700' },
    POSTED: { bg: 'bg-padi-100', text: 'text-padi-700' },
    REVERSED: { bg: 'bg-cream-200', text: 'text-tanah-500 line-through' },
  }[status];
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${map.bg} ${map.text}`}
    >
      {status}
    </span>
  );
}
