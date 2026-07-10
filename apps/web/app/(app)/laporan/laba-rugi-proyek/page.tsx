import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';
import { PageContainer, PageHeader, FilterLabel, Select, Button, buttonClass, filterBarClass } from '@/components/ui';

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
      <PageContainer size="list">
        <PageHeader
          title="Laba Rugi per Proyek"
          subtitle="Ringkasan laba rugi seluruh proyek + cetak detail per proyek dalam satu file."
          actions={
            periodId ? (
              <a
                href={`/proxy/reports/laba-rugi-proyek.pdf?periodId=${periodId}${ytd ? '&ytd=true' : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('soft-bata')}
              >
                Cetak Semua Proyek (PDF)
              </a>
            ) : undefined
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>Periode</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label} ({p.status})</option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-tanah-700">
            <input type="checkbox" name="ytd" value="true" defaultChecked={ytd} /> YTD (awal tahun s/d periode)
          </label>
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Tampilkan</Button>
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
                      <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(r.pendapatan)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(r.bebanPokok)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(r.bebanOperasi)}</td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold ${Number(r.labaBersih) < 0 ? 'text-bata-600' : 'text-padi-700'}`}>{fmtRp(r.labaBersih)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">{r.marginPersen}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-wedel-900 text-cream-50 font-bold">
                    <td className="px-4 py-3">TOTAL SEMUA PROYEK</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(data.total.pendapatan)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(data.total.bebanPokok)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(data.total.bebanOperasi)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(data.total.labaBersih)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">{data.total.marginPersen}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}
