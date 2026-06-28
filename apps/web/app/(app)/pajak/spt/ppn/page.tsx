import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp, fmtTanggal } from '@/lib/format';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface SptLine {
  nomor: string | null;
  tanggal: string;
  pihakNama: string;
  pihakNpwp: string | null;
  pihakIsPkp: boolean;
  kodeFakturPajak: string | null;
  nsfp: string | null;
  dpp: string;
  ppn: string;
}
interface Spt {
  periode: { id: string; label: string };
  ppnKeluaran: { rows: SptLine[]; totalDpp: string; totalPpn: string };
  ppnMasukan: { rows: SptLine[]; totalDpp: string; totalPpn: string };
  ppnKurangLebihBayar: string;
  status: 'KURANG_BAYAR' | 'LEBIH_BAYAR' | 'NIHIL';
}

export default async function SptPpnPage({
  searchParams,
}: { searchParams: Promise<{ periodId?: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id;

  let spt: Spt | null = null;
  if (periodId) {
    spt = await apiFetch<Spt>(`/spt/ppn?periodId=${periodId}`, { tenantId });
  }

  return (
    <>
      <Topbar breadcrumb="SPT Masa PPN" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              SPT Masa PPN (1111)
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Rekap PPN keluaran (faktur penjualan PKP) − PPN masukan (vendor PKP). Selisih: kurang bayar / lebih bayar.
            </p>
          </div>
          {periodId && (
            <a href={`/proxy/spt/ppn/export.xlsx?periodId=${periodId}`}
              className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
              Export Excel
            </a>
          )}
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-3 shadow-sm text-sm">
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">Periode:</span>
          <select name="periodId" defaultValue={periodId}
            className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label} ({p.status})</option>
            ))}
          </select>
          <button className="px-3 py-1.5 bg-cream-200 border border-cream-400 rounded-md text-xs font-semibold text-tanah-700">
            Tampilkan
          </button>
        </form>

        {spt && (
          <>
            {/* Ringkasan */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Stat label="PPN Keluaran" value={fmtRp(spt.ppnKeluaran.totalPpn)} tone="bata" />
              <Stat label="PPN Masukan (dikreditkan)" value={fmtRp(spt.ppnMasukan.totalPpn)} tone="padi" />
              <Stat label={
                spt.status === 'KURANG_BAYAR' ? 'Kurang Bayar (setor ke negara)' :
                spt.status === 'LEBIH_BAYAR' ? 'Lebih Bayar (restitusi/kompensasi)' :
                'Nihil'
              } value={fmtRp(Math.abs(Number(spt.ppnKurangLebihBayar)))}
              tone={spt.status === 'KURANG_BAYAR' ? 'bata' : spt.status === 'LEBIH_BAYAR' ? 'padi' : undefined} big />
            </div>

            <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 font-display text-lg font-semibold text-wedel-900">
                PPN Keluaran (Faktur Penjualan)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-white text-left">
                  <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                    <th className="px-3 py-2 font-bold">No Faktur</th>
                    <th className="px-3 py-2 font-bold">Tgl</th>
                    <th className="px-3 py-2 font-bold">Pelanggan</th>
                    <th className="px-3 py-2 font-bold">NPWP</th>
                    <th className="px-3 py-2 font-bold">Kode FP / NSFP</th>
                    <th className="px-3 py-2 font-bold text-right">DPP</th>
                    <th className="px-3 py-2 font-bold text-right">PPN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {spt.ppnKeluaran.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-xs text-sogan-500">{r.nomor}</td>
                      <td className="px-3 py-1.5 text-xs text-tanah-500">{fmtTanggal(r.tanggal)}</td>
                      <td className="px-3 py-1.5">
                        {r.pihakNama}
                        {r.pihakIsPkp && <span className="ml-1 text-[9px] bg-padi-100 text-padi-700 font-bold px-1 py-0.5 rounded">PKP</span>}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-tanah-500">{fmtNpwp(r.pihakNpwp)}</td>
                      <td className="px-3 py-1.5 text-xs text-tanah-500">
                        {r.kodeFakturPajak ?? '—'}
                        {r.nsfp && <span className="ml-1 font-mono">{r.nsfp}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(r.dpp)}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(r.ppn)}</td>
                    </tr>
                  ))}
                  {spt.ppnKeluaran.rows.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-tanah-500">Tidak ada PPN keluaran.</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-cream-50 font-bold text-tanah-700">
                  <tr><td colSpan={5} className="px-3 py-2 text-right">TOTAL</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(spt.ppnKeluaran.totalDpp)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(spt.ppnKeluaran.totalPpn)}</td></tr>
                </tfoot>
              </table>
            </section>

            <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 font-display text-lg font-semibold text-wedel-900">
                PPN Masukan (Tagihan Pembelian dari Vendor PKP)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-white text-left">
                  <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                    <th className="px-3 py-2 font-bold">No Bill</th>
                    <th className="px-3 py-2 font-bold">Tgl</th>
                    <th className="px-3 py-2 font-bold">Vendor</th>
                    <th className="px-3 py-2 font-bold">NPWP</th>
                    <th className="px-3 py-2 font-bold">NSFP Masukan</th>
                    <th className="px-3 py-2 font-bold text-right">DPP</th>
                    <th className="px-3 py-2 font-bold text-right">PPN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {spt.ppnMasukan.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-xs text-sogan-500">{r.nomor}</td>
                      <td className="px-3 py-1.5 text-xs text-tanah-500">{fmtTanggal(r.tanggal)}</td>
                      <td className="px-3 py-1.5">
                        {r.pihakNama}
                        {r.pihakIsPkp && <span className="ml-1 text-[9px] bg-padi-100 text-padi-700 font-bold px-1 py-0.5 rounded">PKP</span>}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-tanah-500">{fmtNpwp(r.pihakNpwp)}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-tanah-500">{r.nsfp ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(r.dpp)}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(r.ppn)}</td>
                    </tr>
                  ))}
                  {spt.ppnMasukan.rows.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-tanah-500">Tidak ada PPN masukan yang dapat dikreditkan.</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-cream-50 font-bold text-tanah-700">
                  <tr><td colSpan={5} className="px-3 py-2 text-right">TOTAL</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(spt.ppnMasukan.totalDpp)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(spt.ppnMasukan.totalPpn)}</td></tr>
                </tfoot>
              </table>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: 'padi' | 'bata'; big?: boolean }) {
  const cls = tone === 'padi' ? 'text-padi-700' : tone === 'bata' ? 'text-bata-700' : 'text-wedel-900';
  return (
    <div className="bg-white border border-cream-200 rounded-xl p-5 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-tanah-500 font-bold">{label}</div>
      <div className={`font-display font-semibold tabular-nums mt-2 ${cls} ${big ? 'text-3xl' : 'text-xl'}`}>
        {value}
      </div>
    </div>
  );
}
