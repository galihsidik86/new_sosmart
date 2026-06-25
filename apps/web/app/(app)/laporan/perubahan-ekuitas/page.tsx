import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

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
      <Topbar breadcrumb="Perubahan Ekuitas" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-wedel-900">
            Laporan Perubahan Ekuitas
          </h1>
          <p className="text-sm text-tanah-500 mt-1">
            Rekonsiliasi saldo awal → saldo akhir ekuitas via tambahan modal, laba bersih, & dividen.
          </p>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-3 shadow-sm text-sm">
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">s/d akhir:</span>
          <select name="periodId" defaultValue={periodId}
            className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
            {years[0]?.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.status})</option>)}
          </select>
          <button className="ml-auto px-3 py-1.5 bg-cream-200 border border-cream-400 rounded-md text-xs font-semibold text-tanah-700">
            Tampilkan
          </button>
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
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(pe.saldoAwal.modal)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(pe.saldoAwal.saldoLaba)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-bold">{fmtRp(pe.saldoAwal.total)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-tanah-700 pl-8">Penambahan Modal Disetor</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums text-padi-700">
                    {Number(pe.tambahanModal) > 0 ? `+${fmtRp(pe.tambahanModal)}` : '—'}
                  </td>
                  <td className="px-4 py-1.5 text-right text-tanah-400">—</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums text-padi-700">
                    {Number(pe.tambahanModal) > 0 ? `+${fmtRp(pe.tambahanModal)}` : '—'}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-tanah-700 pl-8">Laba Bersih Periode</td>
                  <td className="px-4 py-1.5 text-right text-tanah-400">—</td>
                  <td className={`px-4 py-1.5 text-right font-mono tabular-nums ${Number(pe.labaBersih) >= 0 ? 'text-padi-700' : 'text-bata-700'}`}>
                    {Number(pe.labaBersih) >= 0 ? '+' : ''}{fmtRp(pe.labaBersih)}
                  </td>
                  <td className={`px-4 py-1.5 text-right font-mono tabular-nums ${Number(pe.labaBersih) >= 0 ? 'text-padi-700' : 'text-bata-700'}`}>
                    {Number(pe.labaBersih) >= 0 ? '+' : ''}{fmtRp(pe.labaBersih)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-tanah-700 pl-8">(Dividen / Prive)</td>
                  <td className="px-4 py-1.5 text-right text-tanah-400">—</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums text-bata-700">
                    {Number(pe.dividen) > 0 ? `(${fmtRp(pe.dividen).replace('Rp ', '')})` : '—'}
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums text-bata-700">
                    {Number(pe.dividen) > 0 ? `(${fmtRp(pe.dividen).replace('Rp ', '')})` : '—'}
                  </td>
                </tr>
                <tr className="bg-wedel-900 text-cream-50 font-bold">
                  <td className="px-4 py-3 text-base">Saldo Akhir Periode</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtRp(pe.saldoAkhir.modal)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtRp(pe.saldoAkhir.saldoLaba)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-base">{fmtRp(pe.saldoAkhir.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
