import { Fragment } from 'react';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain } from '@/lib/format';

type BudgetStatus = 'OK' | 'WARNING' | 'EXCEEDED';

interface Row {
  budgetId: string;
  project: { id: string; kode: string; nama: string };
  account: { id: string; kode: string; nama: string; normalBalance: 'DEBIT' | 'KREDIT' };
  periode: string;
  budget: string;
  actual: string;
  variance: string;
  utilisasiPersen: string;
  status: BudgetStatus;
  hardBlock: boolean;
  catatan: string | null;
}
interface Group {
  project: { id: string; kode: string; nama: string };
  rows: Row[];
  totalBudget: string;
  totalActual: string;
  totalVariance: string;
}
interface Resp {
  periode: string;
  startDate: string;
  endDate: string;
  projects: Group[];
  grandTotal: { budget: string; actual: string; variance: string };
}
interface Project { id: string; kode: string; nama: string }

function periodeNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function statusClass(s: BudgetStatus): string {
  switch (s) {
    case 'OK': return 'bg-padi-100 text-padi-700';
    case 'WARNING': return 'bg-emas-100 text-emas-700';
    case 'EXCEEDED': return 'bg-bata-100 text-bata-700';
  }
}

export default async function BudgetActualPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; projectId?: string; ytd?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const periode = sp.periode ?? periodeNow();
  const projectId = sp.projectId ?? '';
  const ytd = sp.ytd === 'true';
  const projectQs = projectId ? `&projectId=${encodeURIComponent(projectId)}` : '';
  const ytdQs = ytd ? '&ytd=true' : '';

  const [projects, data] = await Promise.all([
    apiFetch<Project[]>('/projects', { tenantId }).catch(() => [] as Project[]),
    apiFetch<Resp>(`/reports/budget-actual?periode=${periode}${ytdQs}${projectQs}`, { tenantId }),
  ]);

  return (
    <>
      <Topbar breadcrumb="Budget vs Actual" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-2">
              Budget vs Actual
            </h1>
            <p className="text-sm text-tanah-500">
              Realisasi mutasi POSTED per (Project × Akun) dibanding anggaran{' '}
              {ytd ? <span className="font-semibold text-wedel-900">kumulatif (YTD s/d {periode})</span> : <span className="font-semibold text-wedel-900">bulan {periode}</span>}.
              Utilisasi &gt; 80% = WARNING, &gt; 100% = EXCEEDED.
            </p>
          </div>
          <a
            href={`/proxy/reports/budget-actual.xlsx?periode=${periode}${ytdQs}${projectQs}`}
            className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700"
          >
            Export Excel
          </a>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-4 mb-6 flex items-end gap-3 shadow-sm">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Periode (YYYY-MM)
            </label>
            <input
              type="month" name="periode" defaultValue={periode}
              className="px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
            />
          </div>
          {projects.length > 0 && (
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                Project
              </label>
              <select
                name="projectId" defaultValue={projectId}
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
              >
                <option value="">— semua project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-sm text-tanah-700 pb-2 whitespace-nowrap">
            <input type="checkbox" name="ytd" value="true" defaultChecked={ytd} /> YTD (kumulatif)
          </label>
          <button className="px-3 py-2 bg-cream-200 border border-cream-400 rounded-md text-sm font-semibold text-tanah-700">
            Tampilkan
          </button>
        </form>

        {data.projects.length === 0 ? (
          <div className="bg-white border border-cream-200 rounded-xl p-10 text-center text-tanah-500 text-sm">
            Belum ada anggaran (budget) untuk periode {data.periode}
            {projectId && ' di project terpilih'}.
            Set budget di halaman <span className="font-mono">Master Data → Project</span>.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[10px] uppercase tracking-wider text-tanah-500">
                  <th className="px-3 py-2.5 font-bold">Akun</th>
                  <th className="px-3 py-2.5 font-bold text-right w-36">Budget</th>
                  <th className="px-3 py-2.5 font-bold text-right w-36">Actual</th>
                  <th className="px-3 py-2.5 font-bold text-right w-36">Variance</th>
                  <th className="px-3 py-2.5 font-bold w-40">Utilisasi</th>
                  <th className="px-3 py-2.5 font-bold w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((g) => (
                  <Fragment key={g.project.id}>
                    <tr className="bg-wedel-900/[0.03] border-t border-cream-200">
                      <td colSpan={6} className="px-3 py-2 text-xs uppercase tracking-wider font-bold text-tanah-700">
                        {g.project.kode} — {g.project.nama}
                      </td>
                    </tr>
                    {g.rows.map((r) => {
                      const util = Number(r.utilisasiPersen);
                      const barWidth = Math.min(100, util);
                      const barColor =
                        r.status === 'EXCEEDED' ? 'bg-bata-500'
                          : r.status === 'WARNING' ? 'bg-emas-500'
                            : 'bg-padi-500';
                      const variance = Number(r.variance);
                      return (
                        <tr key={r.budgetId} className="border-t border-cream-200 hover:bg-cream-50">
                          <td className="px-3 py-2">
                            <span className="font-mono text-tanah-700">{r.account.kode}</span>{' '}
                            <span className="text-tanah-500">— {r.account.nama}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(r.budget)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(r.actual)}</td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap ${variance < 0 ? 'text-bata-700 font-bold' : 'text-tanah-700'}`}>
                            {fmtPlain(r.variance)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-cream-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${barColor}`}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <span className="text-xs text-tanah-500 tabular-nums w-10 text-right">
                                {util.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusClass(r.status)}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-cream-200 bg-cream-50 font-semibold text-tanah-700">
                      <td className="px-3 py-1.5 text-xs text-right">Sub-total</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(g.totalBudget)}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(g.totalActual)}</td>
                      <td className={`px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap ${Number(g.totalVariance) < 0 ? 'text-bata-700' : ''}`}>
                        {fmtPlain(g.totalVariance)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-cream-300 bg-cream-100 font-bold text-tanah-700 text-sm">
                  <td className="px-3 py-2.5 text-right">GRAND TOTAL</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(data.grandTotal.budget)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(data.grandTotal.actual)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${Number(data.grandTotal.variance) < 0 ? 'text-bata-700' : ''}`}>
                    {fmtPlain(data.grandTotal.variance)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
