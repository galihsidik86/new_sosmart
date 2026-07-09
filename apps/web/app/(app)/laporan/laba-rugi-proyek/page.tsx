import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Row {
  project: { id: string; kode: string; nama: string; status: string };
  pendapatan: string; bebanPokok: string; bebanOperasi: string; labaBersih: string; marginPersen: string;
}
interface Resp {
  periode: { id: string; label: string };
  ytd: boolean;
  rows: Row[];
  total: { pendapatan: string; bebanPokok: string; bebanOperasi: string; labaBersih: string; marginPersen: string };
}

export default async function LabaRugiProyekPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; ytd?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;
  const ytd = sp.ytd === 'true';

  let data: Resp | null = null;
  if (periodId) {
    data = await apiFetch<Resp>(
      `/reports/laba-rugi-proyek?periodId=${periodId}${ytd ? '&ytd=true' : ''}`,
      { tenantId },
    );
  }

  return (
    <>
      <Topbar breadcrumb="Laba Rugi per Proyek" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">Laba Rugi per Proyek</h1>
            <p className="text-sm text-tanah-500 mt-1">
              Ringkasan laba rugi seluruh proyek + cetak detail per proyek dalam satu file.
            </p>
          </div>
          {periodId && (
            <a
              href={`/proxy/reports/laba-rugi-proyek.pdf?periodId=${periodId}${ytd ? '&ytd=true' : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-bata-100 hover:bg-bata-200 border border-bata-300 rounded-lg text-sm font-semibold text-bata-700"
            >
              Cetak Semua Proyek (PDF)
            </a>
          )}
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-3 shadow-sm text-sm flex-wrap">
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">Periode:</span>
          <select name="periodId" defaultValue={periodId} className="border border-cream-300 rounded-lg px-3 py-1.5">
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label} ({p.status})</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="ytd" value="true" defaultChecked={ytd} /> YTD (awal tahun s/d periode)
          </label>
          <button className="px-4 py-1.5 bg-wedel-900 text-cream-50 rounded-lg font-semibold">Tampilkan</button>
        </form>

        {data && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200">
              <div className="font-display text-lg font-semibold text-wedel-900">
                Ringkasan {data.rows.length} Proyek — {data.periode.label}{data.ytd ? ' (YTD)' : ''}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 text-[10px] uppercase tracking-wider text-tanah-500">
                    <th className="px-4 py-2 text-left">Proyek</th>
                    <th className="px-4 py-2 text-right">Pendapatan</th>
                    <th className="px-4 py-2 text-right">Beban Pokok</th>
                    <th className="px-4 py-2 text-right">Beban Operasi</th>
                    <th className="px-4 py-2 text-right">Laba Bersih</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.project.id} className="border-t border-cream-100 hover:bg-cream-50">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs text-sogan-500">{r.project.kode}</span>{' '}
                        <span className="text-tanah-700">{r.project.nama}</span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(r.pendapatan)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(r.bebanPokok)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(r.bebanOperasi)}</td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums font-semibold ${Number(r.labaBersih) < 0 ? 'text-bata-600' : 'text-padi-700'}`}>{fmtRp(r.labaBersih)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{r.marginPersen}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-wedel-900 text-cream-50 font-bold">
                    <td className="px-4 py-3">TOTAL SEMUA PROYEK</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtRp(data.total.pendapatan)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtRp(data.total.bebanPokok)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtRp(data.total.bebanOperasi)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtRp(data.total.labaBersih)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{data.total.marginPersen}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
