import { Topbar } from '@/components/Topbar';
import { ReportActions } from '@/components/ReportActions';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal, fmtPlain } from '@/lib/format';
import { PageContainer, PageHeader, FilterLabel, Select, Button, filterBarClass } from '@/components/ui';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Project { id: string; kode: string; nama: string }
interface Row {
  id: string; kode: string; nama: string; nilai: string;
  persenBase?: string;
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}
interface Section {
  rows: Row[];
  total: string;
  persenBase?: string;
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}
interface Sub {
  nilai: string;
  persenBase?: string;
  previous?: string;
  deltaAbs?: string;
  deltaPersen?: string;
}
interface LR {
  periode: { id: string; label: string; startDate: string; endDate: string };
  periodeCompare?: { id: string; label: string; startDate: string; endDate: string };
  pendapatan: Section;
  bebanPokok: Section;
  labaKotor: Sub;
  bebanOperasi: Section;
  labaUsaha: Sub;
  pendapatanLain: Section;
  bebanLain: Section;
  labaSebelumPajak: Sub;
  bebanPajak: Sub;
  labaBersih: Sub;
  vertikal: boolean;
  horizontal: boolean;
  filter?: {
    project?: { kode: string; nama: string };
    cabang?: { kode: string; nama: string };
  };
}

export default async function LabaRugiPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodId?: string;
    ytd?: string;
    projectId?: string;
    vertikal?: string;
    compareToPeriodId?: string;
  }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const [years, projects] = await Promise.all([
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }).catch(() => [] as Project[]),
  ]);
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;
  const ytd = sp.ytd === 'true';
  const projectId = sp.projectId ?? '';
  const vertikal = sp.vertikal === 'true';
  const compareToPeriodId = sp.compareToPeriodId ?? '';
  const projectQs = projectId ? `&projectId=${encodeURIComponent(projectId)}` : '';
  const analysisQs =
    (vertikal ? '&vertikal=true' : '') +
    (compareToPeriodId ? `&compareToPeriodId=${encodeURIComponent(compareToPeriodId)}` : '');

  let lr: LR | null = null;
  if (periodId) {
    lr = await apiFetch<LR>(
      `/reports/laba-rugi?periodId=${periodId}${ytd ? '&ytd=true' : ''}${projectQs}${analysisQs}`,
      { tenantId },
    );
  }

  const showCompare = !!lr?.horizontal;
  const showVertikal = !!lr?.vertikal;
  const cols = 3 + (showVertikal ? 1 : 0) + (showCompare ? 3 : 0);

  return (
    <>
      <Topbar breadcrumb="Laba Rugi" tenantNama={s.tenantNama!} />
      <PageContainer size="form">
        <PageHeader
          title="Laporan Laba Rugi"
          subtitle="Format SAK ETAP · vertikal = % dari Total Pendapatan · horizontal = bandingkan periode."
          actions={
            periodId ? (
              <ReportActions
                xlsx={`/proxy/reports/laba-rugi.xlsx?periodId=${periodId}${ytd ? '&ytd=true' : ''}${projectQs}`}
                pdf={`/proxy/reports/laba-rugi.pdf?periodId=${periodId}${ytd ? '&ytd=true' : ''}${projectQs}`}
              />
            ) : undefined
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>Periode</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.status})</option>)}
          </Select>
          {projects.length > 0 && (
            <>
              <FilterLabel>Project</FilterLabel>
              <Select name="projectId" defaultValue={projectId} fullWidth={false}>
                <option value="">— semua —</option>
                <option value="none">— tanpa project (overhead) —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
                ))}
              </Select>
            </>
          )}
          <label className="flex items-center gap-1.5 text-sm text-tanah-700">
            <input type="checkbox" name="ytd" value="true" defaultChecked={ytd} />
            YTD
          </label>
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

        {lr && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 text-center">
              <div className="font-display text-xl font-semibold text-wedel-900">{s.tenantNama}</div>
              <div className="text-sm text-tanah-500">Laporan Laba Rugi</div>
              <div className="text-xs text-tanah-500">
                {ytd ? 'Periode' : 'Bulan'} {fmtTanggal(lr.periode.startDate)} s/d {fmtTanggal(lr.periode.endDate)}
                {lr.periodeCompare && (
                  <> · vs {lr.periodeCompare.label} ({fmtTanggal(lr.periodeCompare.startDate)}–{fmtTanggal(lr.periodeCompare.endDate)})</>
                )}
              </div>
              {lr.filter && (lr.filter.project || lr.filter.cabang) && (
                <div className="mt-1 text-xs font-semibold text-wedel-800">
                  {lr.filter.project && (
                    <span>Proyek: {lr.filter.project.kode !== '-' ? `${lr.filter.project.kode} — ` : ''}{lr.filter.project.nama}</span>
                  )}
                  {lr.filter.project && lr.filter.cabang && <span className="mx-2 text-tanah-400">|</span>}
                  {lr.filter.cabang && (
                    <span>Cabang: {lr.filter.cabang.kode} — {lr.filter.cabang.nama}</span>
                  )}
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-50 text-[10px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-1.5 text-left" colSpan={2}>Akun</th>
                  <th className="px-4 py-1.5 text-right w-44">Nilai</th>
                  {showVertikal && <th className="px-2 py-1.5 text-right w-16">%</th>}
                  {showCompare && <>
                    <th className="px-4 py-1.5 text-right w-40">Sebelumnya</th>
                    <th className="px-3 py-1.5 text-right w-28">Δ</th>
                    <th className="px-2 py-1.5 text-right w-16">Δ %</th>
                  </>}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                <SectionRow title="Pendapatan Operasional" rows={lr.pendapatan.rows} cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                <TotalRow label="Total Pendapatan" sect={lr.pendapatan} showVertikal={showVertikal} showCompare={showCompare} />

                <SectionRow title="Beban Pokok Penjualan" rows={lr.bebanPokok.rows} negative cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                <TotalRow label="Total Beban Pokok" sect={lr.bebanPokok} negative showVertikal={showVertikal} showCompare={showCompare} />

                <SubRow label="LABA KOTOR" sub={lr.labaKotor} showVertikal={showVertikal} showCompare={showCompare} />

                <SectionRow title="Beban Operasional" rows={lr.bebanOperasi.rows} negative cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                <TotalRow label="Total Beban Operasi" sect={lr.bebanOperasi} negative showVertikal={showVertikal} showCompare={showCompare} />

                <SubRow label="LABA USAHA" sub={lr.labaUsaha} showVertikal={showVertikal} showCompare={showCompare} />

                {lr.pendapatanLain.rows.length > 0 && (
                  <>
                    <SectionRow title="Pendapatan Lain-lain" rows={lr.pendapatanLain.rows} cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                    <TotalRow label="Total Pendapatan Lain" sect={lr.pendapatanLain} showVertikal={showVertikal} showCompare={showCompare} />
                  </>
                )}
                {lr.bebanLain.rows.length > 0 && (
                  <>
                    <SectionRow title="Beban Lain-lain" rows={lr.bebanLain.rows} negative cols={cols} showVertikal={showVertikal} showCompare={showCompare} />
                    <TotalRow label="Total Beban Lain" sect={lr.bebanLain} negative showVertikal={showVertikal} showCompare={showCompare} />
                  </>
                )}

                <SubRow label="LABA SEBELUM PAJAK" sub={lr.labaSebelumPajak} showVertikal={showVertikal} showCompare={showCompare} />

                {Number(lr.bebanPajak.nilai) > 0 && (
                  <TotalRow label="(Beban PPh Badan)" sect={{ rows: [], total: lr.bebanPajak.nilai, persenBase: lr.bebanPajak.persenBase, previous: lr.bebanPajak.previous, deltaAbs: lr.bebanPajak.deltaAbs, deltaPersen: lr.bebanPajak.deltaPersen }} negative showVertikal={showVertikal} showCompare={showCompare} />
                )}

                <tr className="bg-wedel-900 text-cream-50">
                  <td colSpan={2} className="px-4 py-3 font-bold text-base">LABA BERSIH</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-base tabular-nums whitespace-nowrap">{fmtRp(lr.labaBersih.nilai)}</td>
                  {showVertikal && <td className="px-2 py-3 text-right font-mono text-sm">{lr.labaBersih.persenBase}%</td>}
                  {showCompare && <>
                    <td className="px-4 py-3 text-right font-mono text-sm">{fmtRp(lr.labaBersih.previous ?? '0')}</td>
                    <td className="px-3 py-3 text-right font-mono text-sm">{fmtDelta(lr.labaBersih.deltaAbs)}</td>
                    <td className="px-2 py-3 text-right font-mono text-sm">{lr.labaBersih.deltaPersen}%</td>
                  </>}
                </tr>
              </tbody>
            </table>
          </div>
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
  title, rows, negative, cols, showVertikal, showCompare,
}: {
  title: string; rows: Row[]; negative?: boolean; cols: number;
  showVertikal: boolean; showCompare: boolean;
}) {
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
          <td className={`px-4 py-1 text-right font-mono tabular-nums text-sm whitespace-nowrap ${negative ? 'text-bata-700' : ''}`}>
            {negative ? `(${fmtRp(r.nilai).replace('Rp ', '')})` : fmtRp(r.nilai)}
          </td>
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
  label, sect, negative, showVertikal, showCompare,
}: {
  label: string; sect: Section; negative?: boolean;
  showVertikal: boolean; showCompare: boolean;
}) {
  const t = fmtRp(sect.total);
  const displayTotal = negative ? `(${t.replace('Rp ', '')})` : t;
  return (
    <tr className="bg-cream-100">
      <td colSpan={2} className="px-4 py-1.5 text-sm font-semibold text-tanah-700">{label}</td>
      <td className="px-4 py-1.5 text-right font-mono tabular-nums text-sm font-semibold whitespace-nowrap">
        {displayTotal}
      </td>
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
  label, sub, showVertikal, showCompare,
}: {
  label: string; sub: Sub;
  showVertikal: boolean; showCompare: boolean;
}) {
  return (
    <tr className="bg-cream-200 border-y-2 border-cream-400">
      <td colSpan={2} className="px-4 py-2 font-display text-base font-semibold text-wedel-900">{label}</td>
      <td className="px-4 py-2 text-right font-display font-semibold text-base text-wedel-900 tabular-nums whitespace-nowrap">{fmtRp(sub.nilai)}</td>
      {showVertikal && <td className="px-2 py-2 text-right font-mono text-sm text-wedel-900">{sub.persenBase}%</td>}
      {showCompare && <>
        <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-tanah-500">{fmtRp(sub.previous ?? '0')}</td>
        <td className={`px-3 py-2 text-right font-mono text-sm ${Number(sub.deltaAbs) < 0 ? 'text-bata-700' : Number(sub.deltaAbs) > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>{fmtDelta(sub.deltaAbs)}</td>
        <td className="px-2 py-2 text-right font-mono text-sm text-tanah-500">{sub.deltaPersen}%</td>
      </>}
    </tr>
  );
}
