import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal, fmtPlain } from '@/lib/format';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Row {
  id: string; kode: string; nama: string; nilai: string;
  persenBase?: string; previous?: string; deltaAbs?: string; deltaPersen?: string;
}
interface Section {
  rows: Row[]; total: string;
  persenBase?: string; previous?: string; deltaAbs?: string; deltaPersen?: string;
}
interface Sub {
  nilai: string;
  persenBase?: string; previous?: string; deltaAbs?: string; deltaPersen?: string;
}
interface NRC {
  asOf: string;
  periode: { id: string; label: string };
  periodeCompare?: { id: string; label: string; asOf: string };
  asetLancar: Section;
  asetTetap: Section;
  totalAset: Sub;
  liabilitasJangkaPendek: Section;
  liabilitasJangkaPanjang: Section;
  totalLiabilitas: Sub;
  ekuitas: Section;
  labaBerjalan: Sub;
  totalEkuitas: Sub;
  totalLiabilitasEkuitas: Sub;
  balanced: boolean;
  selisih: string;
  vertikal: boolean;
  horizontal: boolean;
}

export default async function NeracaPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodId?: string;
    vertikal?: string;
    compareToPeriodId?: string;
  }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;
  const vertikal = sp.vertikal === 'true';
  const compareToPeriodId = sp.compareToPeriodId ?? '';
  const analysisQs =
    (vertikal ? '&vertikal=true' : '') +
    (compareToPeriodId ? `&compareToPeriodId=${encodeURIComponent(compareToPeriodId)}` : '');

  let n: NRC | null = null;
  if (periodId) {
    n = await apiFetch<NRC>(`/reports/neraca?periodId=${periodId}${analysisQs}`, { tenantId });
  }

  const showVertikal = !!n?.vertikal;
  const showCompare = !!n?.horizontal;
  const cols = 3 + (showVertikal ? 1 : 0) + (showCompare ? 3 : 0);

  return (
    <>
      <Topbar breadcrumb="Neraca" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Laporan Neraca
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Posisi Keuangan · vertikal = % dari Total Aset · horizontal = bandingkan periode.
            </p>
          </div>
          {periodId && (
            <div className="flex items-center gap-2">
              <a
                href={`/proxy/reports/neraca.xlsx?periodId=${periodId}`}
                className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700"
              >
                Export Excel
              </a>
              <a
                href={`/proxy/reports/neraca.pdf?periodId=${periodId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-bata-100 hover:bg-bata-200 border border-bata-300 rounded-lg text-sm font-semibold text-bata-700"
              >
                Preview PDF
              </a>
            </div>
          )}
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-3 shadow-sm text-sm flex-wrap">
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">Per akhir:</span>
          <select name="periodId" defaultValue={periodId}
            className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
            {years[0]?.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.status})</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="vertikal" value="true" defaultChecked={vertikal} />
            Vertikal (%)
          </label>
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">Bandingkan:</span>
          <select name="compareToPeriodId" defaultValue={compareToPeriodId}
            className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
            <option value="">— tidak —</option>
            {years[0]?.periods
              .filter((p) => p.id !== periodId)
              .map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button className="ml-auto px-3 py-1.5 bg-cream-200 border border-cream-400 rounded-md text-xs font-semibold text-tanah-700">
            Tampilkan
          </button>
        </form>

        {n && (
          <>
            <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-4">
              <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 text-center">
                <div className="font-display text-xl font-semibold text-wedel-900">{s.tenantNama}</div>
                <div className="text-sm text-tanah-500">Laporan Posisi Keuangan</div>
                <div className="text-xs text-tanah-500">
                  Per {fmtTanggal(n.asOf)}
                  {n.periodeCompare && <> · vs {fmtTanggal(n.periodeCompare.asOf)}</>}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 text-[10px] uppercase tracking-wider text-tanah-500">
                    <th className="px-4 py-1.5 text-left" colSpan={2}>Akun</th>
                    <th className="px-4 py-1.5 text-right w-32">Saldo</th>
                    {showVertikal && <th className="px-2 py-1.5 text-right w-16">%</th>}
                    {showCompare && <>
                      <th className="px-4 py-1.5 text-right w-32">Sebelumnya</th>
                      <th className="px-3 py-1.5 text-right w-28">Δ</th>
                      <th className="px-2 py-1.5 text-right w-16">Δ %</th>
                    </>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  <SectionRow title="ASET LANCAR" rows={n.asetLancar.rows} cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                  <TotalRow label="Total Aset Lancar" sect={n.asetLancar} showVertikal={showVertikal} showCompare={showCompare} />

                  <SectionRow title="ASET TETAP" rows={n.asetTetap.rows} cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                  <TotalRow label="Total Aset Tetap" sect={n.asetTetap} showVertikal={showVertikal} showCompare={showCompare} />

                  <SubRow label="TOTAL ASET" sub={n.totalAset} showVertikal={showVertikal} showCompare={showCompare} highlight />

                  <SectionRow title="LIABILITAS JANGKA PENDEK" rows={n.liabilitasJangkaPendek.rows} cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                  <TotalRow label="Total Liab Jangka Pendek" sect={n.liabilitasJangkaPendek} showVertikal={showVertikal} showCompare={showCompare} />

                  <SectionRow title="LIABILITAS JANGKA PANJANG" rows={n.liabilitasJangkaPanjang.rows} cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                  <TotalRow label="Total Liab Jangka Panjang" sect={n.liabilitasJangkaPanjang} showVertikal={showVertikal} showCompare={showCompare} />

                  <SectionRow title="EKUITAS" rows={n.ekuitas.rows} cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                  <SubRow label="Laba berjalan periode" sub={n.labaBerjalan} showVertikal={showVertikal} showCompare={showCompare} />
                  <TotalRow label="Total Ekuitas" sect={{ ...n.ekuitas, total: n.totalEkuitas.nilai, persenBase: n.totalEkuitas.persenBase, previous: n.totalEkuitas.previous, deltaAbs: n.totalEkuitas.deltaAbs, deltaPersen: n.totalEkuitas.deltaPersen, rows: [] }} showVertikal={showVertikal} showCompare={showCompare} />

                  <SubRow label="TOTAL LIABILITAS + EKUITAS" sub={n.totalLiabilitasEkuitas} showVertikal={showVertikal} showCompare={showCompare} highlight />
                </tbody>
              </table>
            </div>

            <div className={`rounded-xl p-4 text-sm font-semibold ${
              n.balanced ? 'bg-padi-100 text-padi-700' : 'bg-bata-100 text-bata-700'
            }`}>
              {n.balanced
                ? '✓ Neraca seimbang — Aset = Liabilitas + Ekuitas'
                : `⚠ Tidak seimbang — selisih ${fmtRp(n.selisih)}`}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function fmtDelta(v?: string): string {
  if (!v) return '';
  const n = Number(v);
  return (n > 0 ? '+' : '') + fmtPlain(v);
}

function SectionRow({
  title, rows, cols, showVertikal, showCompare,
}: { title: string; rows: Row[]; cols: number; showVertikal: boolean; showCompare: boolean }) {
  return (
    <>
      <tr className="bg-cream-50">
        <td colSpan={cols} className="px-4 py-2 text-[11px] uppercase tracking-wider font-bold text-tanah-700">{title}</td>
      </tr>
      {rows.length === 0 ? (
        <tr><td colSpan={cols} className="px-4 py-1.5 text-tanah-400 text-xs italic pl-8">— tidak ada —</td></tr>
      ) : rows.map((r) => (
        <tr key={r.id}>
          <td className="px-4 py-1 font-mono text-xs text-tanah-500 pl-8 w-20">{r.kode}</td>
          <td className="px-2 py-1 text-tanah-700 text-sm">{r.nama}</td>
          <td className="px-4 py-1 text-right font-mono tabular-nums text-sm">{fmtRp(r.nilai)}</td>
          {showVertikal && <td className="px-2 py-1 text-right font-mono text-xs text-tanah-500">{r.persenBase}%</td>}
          {showCompare && <>
            <td className="px-4 py-1 text-right font-mono tabular-nums text-xs text-tanah-500">{fmtRp(r.previous ?? '0')}</td>
            <td className={`px-3 py-1 text-right font-mono text-xs ${Number(r.deltaAbs) < 0 ? 'text-bata-700' : Number(r.deltaAbs) > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>{fmtDelta(r.deltaAbs)}</td>
            <td className="px-2 py-1 text-right font-mono text-xs text-tanah-500">{r.deltaPersen}%</td>
          </>}
        </tr>
      ))}
    </>
  );
}

function TotalRow({
  label, sect, showVertikal, showCompare,
}: { label: string; sect: Section; showVertikal: boolean; showCompare: boolean }) {
  return (
    <tr className="bg-cream-100">
      <td colSpan={2} className="px-4 py-1.5 text-sm font-semibold text-tanah-700">{label}</td>
      <td className="px-4 py-1.5 text-right font-mono tabular-nums text-sm font-semibold">{fmtRp(sect.total)}</td>
      {showVertikal && <td className="px-2 py-1.5 text-right font-mono text-xs text-tanah-500">{sect.persenBase}%</td>}
      {showCompare && <>
        <td className="px-4 py-1.5 text-right font-mono tabular-nums text-xs text-tanah-500">{fmtRp(sect.previous ?? '0')}</td>
        <td className={`px-3 py-1.5 text-right font-mono text-xs ${Number(sect.deltaAbs) < 0 ? 'text-bata-700' : Number(sect.deltaAbs) > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>{fmtDelta(sect.deltaAbs)}</td>
        <td className="px-2 py-1.5 text-right font-mono text-xs text-tanah-500">{sect.deltaPersen}%</td>
      </>}
    </tr>
  );
}

function SubRow({
  label, sub, showVertikal, showCompare, highlight,
}: {
  label: string; sub: Sub; showVertikal: boolean; showCompare: boolean; highlight?: boolean;
}) {
  const cls = highlight ? 'bg-wedel-900 text-cream-50' : 'bg-cream-200 border-y-2 border-cream-400';
  return (
    <tr className={cls}>
      <td colSpan={2} className={`px-4 py-2 ${highlight ? 'font-bold text-base' : 'font-display text-base font-semibold'}`}>{label}</td>
      <td className="px-4 py-2 text-right font-mono font-bold tabular-nums">{fmtRp(sub.nilai)}</td>
      {showVertikal && <td className="px-2 py-2 text-right font-mono text-sm">{sub.persenBase}%</td>}
      {showCompare && <>
        <td className="px-4 py-2 text-right font-mono tabular-nums text-xs">{fmtRp(sub.previous ?? '0')}</td>
        <td className={`px-3 py-2 text-right font-mono text-xs ${highlight ? '' : Number(sub.deltaAbs) < 0 ? 'text-bata-700' : Number(sub.deltaAbs) > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>{fmtDelta(sub.deltaAbs)}</td>
        <td className="px-2 py-2 text-right font-mono text-xs">{sub.deltaPersen}%</td>
      </>}
    </tr>
  );
}
