import { ReportActions } from '@/components/ReportActions';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, FilterLabel, Select, Button, filterBarClass } from '@/components/ui';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface PE {
  periode: { id: string; label: string; startDate: string; endDate: string };
  saldoAwal: { modal: string; saldoLaba: string; total: string };
  tambahanModal: string;
  labaBersih: string;
  dividen: string;
  saldoAkhir: { modal: string; saldoLaba: string; total: string };
}

export default async function PerubahanEkuitasPage({
  searchParams,
}: { searchParams: Promise<{ periodId?: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;

  let pe: PE | null = null;
  if (periodId) {
    pe = await apiFetch<PE>(`/reports/perubahan-ekuitas?periodId=${periodId}`, { tenantId });
  }

  return (
    <>
      <PageContainer size="form">
        <PageHeader
          title="Laporan Perubahan Ekuitas"
          subtitle="Rekonsiliasi saldo awal → saldo akhir ekuitas via tambahan modal, laba bersih, & dividen."
          actions={
            periodId ? (
              <ReportActions
                xlsx={`/proxy/reports/perubahan-ekuitas.xlsx?periodId=${periodId}`}
                pdf={`/proxy/reports/perubahan-ekuitas.pdf?periodId=${periodId}`}
              />
            ) : undefined
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>s/d akhir</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.status})</option>)}
          </Select>
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Tampilkan</Button>
        </form>

        {pe && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 text-center">
              <div className="font-display text-xl font-semibold text-wedel-900">{s.tenantNama}</div>
              <div className="text-sm text-tanah-500">Laporan Perubahan Ekuitas</div>
              <div className="text-xs text-tanah-500">
                {fmtTanggal(pe.periode.startDate)} s/d {fmtTanggal(pe.periode.endDate)}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-cream-50">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                  <th className="px-4 py-2 text-left font-bold">Keterangan</th>
                  <th className="px-4 py-2 text-right font-bold">Modal Disetor</th>
                  <th className="px-4 py-2 text-right font-bold">Saldo Laba</th>
                  <th className="px-4 py-2 text-right font-bold">Total Ekuitas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                <tr className="bg-cream-100 font-semibold">
                  <td className="px-4 py-2 text-tanah-700">Saldo Awal Periode</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(pe.saldoAwal.modal)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(pe.saldoAwal.saldoLaba)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap font-bold">{fmtRp(pe.saldoAwal.total)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-tanah-700 pl-8">Penambahan Modal Disetor</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-padi-700">
                    {Number(pe.tambahanModal) > 0 ? `+${fmtRp(pe.tambahanModal)}` : '—'}
                  </td>
                  <td className="px-4 py-1.5 text-right text-tanah-500">—</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-padi-700">
                    {Number(pe.tambahanModal) > 0 ? `+${fmtRp(pe.tambahanModal)}` : '—'}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-tanah-700 pl-8">Laba Bersih Periode</td>
                  <td className="px-4 py-1.5 text-right text-tanah-500">—</td>
                  <td className={`px-4 py-1.5 text-right font-mono tabular-nums whitespace-nowrap ${Number(pe.labaBersih) >= 0 ? 'text-padi-700' : 'text-bata-700'}`}>
                    {Number(pe.labaBersih) >= 0 ? '+' : ''}{fmtRp(pe.labaBersih)}
                  </td>
                  <td className={`px-4 py-1.5 text-right font-mono tabular-nums whitespace-nowrap ${Number(pe.labaBersih) >= 0 ? 'text-padi-700' : 'text-bata-700'}`}>
                    {Number(pe.labaBersih) >= 0 ? '+' : ''}{fmtRp(pe.labaBersih)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-tanah-700 pl-8">(Dividen / Prive)</td>
                  <td className="px-4 py-1.5 text-right text-tanah-500">—</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-bata-700">
                    {Number(pe.dividen) > 0 ? `(${fmtRp(pe.dividen).replace('Rp ', '')})` : '—'}
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-bata-700">
                    {Number(pe.dividen) > 0 ? `(${fmtRp(pe.dividen).replace('Rp ', '')})` : '—'}
                  </td>
                </tr>
                <tr className="bg-wedel-900 text-cream-50 font-bold">
                  <td className="px-4 py-3 text-base">Saldo Akhir Periode</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(pe.saldoAkhir.modal)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(pe.saldoAkhir.saldoLaba)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-base">{fmtRp(pe.saldoAkhir.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </PageContainer>
    </>
  );
}
