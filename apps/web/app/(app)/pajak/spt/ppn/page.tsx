import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, FilterLabel, Select, Button, StatCard, buttonClass, filterBarClass,
} from '@/components/ui';

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
      <PageContainer size="list">
        <PageHeader
          title="SPT Masa PPN (1111)"
          subtitle="Rekap PPN keluaran (faktur penjualan PKP) − PPN masukan (vendor PKP). Selisih: kurang bayar / lebih bayar."
          actions={
            periodId ? (
              <a href={`/proxy/spt/ppn/export.xlsx?periodId=${periodId}`} className={buttonClass('success')}>Export Excel</a>
            ) : undefined
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>Periode:</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label} ({p.status})</option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm">Tampilkan</Button>
        </form>

        {spt && (
          <>
            {/* Ringkasan */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard label="PPN Keluaran" value={fmtRp(spt.ppnKeluaran.totalPpn)} tone="danger" />
              <StatCard label="PPN Masukan (dikreditkan)" value={fmtRp(spt.ppnMasukan.totalPpn)} tone="success" />
              <StatCard label={
                spt.status === 'KURANG_BAYAR' ? 'Kurang Bayar (setor ke negara)' :
                spt.status === 'LEBIH_BAYAR' ? 'Lebih Bayar (restitusi/kompensasi)' :
                'Nihil'
              } value={fmtRp(Math.abs(Number(spt.ppnKurangLebihBayar)))}
              tone={spt.status === 'KURANG_BAYAR' ? 'danger' : spt.status === 'LEBIH_BAYAR' ? 'success' : 'default'} />
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
      </PageContainer>
    </>
  );
}
