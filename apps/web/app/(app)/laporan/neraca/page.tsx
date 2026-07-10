import { Topbar } from '@/components/Topbar';
import { ReportActions } from '@/components/ReportActions';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal, fmtPlain } from '@/lib/format';
import { PageContainer, PageHeader, FilterLabel, Select, Button, StatusBanner, filterBarClass } from '@/components/ui';

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
      <PageContainer size="form">
        <PageHeader
          title="Laporan Neraca"
          subtitle="Posisi Keuangan · vertikal = % dari Total Aset · horizontal = bandingkan periode."
          actions={
            periodId ? (
              <ReportActions
                xlsx={`/proxy/reports/neraca.xlsx?periodId=${periodId}`}
                pdf={`/proxy/reports/neraca.pdf?periodId=${periodId}`}
              />
            ) : undefined
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>Per akhir</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.status})</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-tanah-700">
            <input type="checkbox" name="vertikal" value="true" defaultChecked={vertikal} />
            Vertikal (%)
          </label>
          <FilterLabel>Bandingkan</FilterLabel>
          <Select name="compareToPeriodId" defaultValue={compareToPeriodId} fullWidth={false}>
            <option value="">— tidak —</option>
            {years[0]?.periods
              .filter((p) => p.id !== periodId)
              .map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Tampilkan</Button>
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
                    <th className="px-4 py-1.5 text-right w-44">Saldo</th>
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

            <StatusBanner tone={n.balanced ? 'success' : 'danger'}>
              {n.balanced
                ? '✓ Neraca seimbang — Aset = Liabilitas + Ekuitas'
                : `⚠ Tidak seimbang — selisih ${fmtRp(n.selisih)}`}
            </StatusBanner>
          </>
        )}
      </PageContainer>
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
          <td className="px-4 py-1 font-mono text-xs text-tanah-500 pl-8 whitespace-nowrap">{r.kode}</td>
          <td className="px-2 py-1 text-tanah-700 text-sm">{r.nama}</td>
          <td className="px-4 py-1 text-right font-mono tabular-nums text-sm whitespace-nowrap">{fmtRp(r.nilai)}</td>
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
      <td className="px-4 py-1.5 text-right font-mono tabular-nums text-sm font-semibold whitespace-nowrap">{fmtRp(sect.total)}</td>
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
      <td className="px-4 py-2 text-right font-mono font-bold tabular-nums whitespace-nowrap">{fmtRp(sub.nilai)}</td>
      {showVertikal && <td className="px-2 py-2 text-right font-mono text-sm">{sub.persenBase}%</td>}
      {showCompare && <>
        <td className="px-4 py-2 text-right font-mono tabular-nums text-xs">{fmtRp(sub.previous ?? '0')}</td>
        <td className={`px-3 py-2 text-right font-mono text-xs ${highlight ? '' : Number(sub.deltaAbs) < 0 ? 'text-bata-700' : Number(sub.deltaAbs) > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>{fmtDelta(sub.deltaAbs)}</td>
        <td className="px-2 py-2 text-right font-mono text-xs">{sub.deltaPersen}%</td>
      </>}
    </tr>
  );
}
