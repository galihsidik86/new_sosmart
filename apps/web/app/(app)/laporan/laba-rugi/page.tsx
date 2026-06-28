import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Row { id: string; kode: string; nama: string; nilai: string }
interface LR {
  periode: { id: string; label: string; startDate: string; endDate: string };
  pendapatan: { rows: Row[]; total: string };
  bebanPokok: { rows: Row[]; total: string };
  labaKotor: string;
  bebanOperasi: { rows: Row[]; total: string };
  labaUsaha: string;
  pendapatanLain: { rows: Row[]; total: string };
  bebanLain: { rows: Row[]; total: string };
  labaSebelumPajak: string;
  bebanPajak: string;
  labaBersih: string;
}

export default async function LabaRugiPage({
  searchParams,
}: { searchParams: Promise<{ periodId?: string; ytd?: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;
  const ytd = sp.ytd === 'true';

  let lr: LR | null = null;
  if (periodId) {
    lr = await apiFetch<LR>(
      `/reports/laba-rugi?periodId=${periodId}${ytd ? '&ytd=true' : ''}`,
      { tenantId },
    );
  }

  return (
    <>
      <Topbar breadcrumb="Laba Rugi" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-4xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Laporan Laba Rugi
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Format SAK ETAP — pendapatan, HPP, beban operasi, beban lain, laba bersih.
            </p>
          </div>
          {periodId && (
            <div className="flex items-center gap-2">
              <a
                href={`/proxy/reports/laba-rugi.xlsx?periodId=${periodId}${ytd ? '&ytd=true' : ''}`}
                className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700"
              >
                Export Excel
              </a>
              <a
                href={`/proxy/reports/laba-rugi.pdf?periodId=${periodId}${ytd ? '&ytd=true' : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-bata-100 hover:bg-bata-200 border border-bata-300 rounded-lg text-sm font-semibold text-bata-700"
              >
                Preview PDF
              </a>
            </div>
          )}
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-3 shadow-sm text-sm">
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">Periode:</span>
          <select name="periodId" defaultValue={periodId}
            className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
            {years[0]?.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.status})</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="ytd" value="true" defaultChecked={ytd} />
            YTD (Year-to-Date)
          </label>
          <button className="ml-auto px-3 py-1.5 bg-cream-200 border border-cream-400 rounded-md text-xs font-semibold text-tanah-700">
            Tampilkan
          </button>
        </form>

        {lr && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 text-center">
              <div className="font-display text-xl font-semibold text-wedel-900">{s.tenantNama}</div>
              <div className="text-sm text-tanah-500">Laporan Laba Rugi</div>
              <div className="text-xs text-tanah-500">
                {ytd ? 'Periode' : 'Bulan'} {fmtTanggal(lr.periode.startDate)} s/d {fmtTanggal(lr.periode.endDate)}
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-cream-200">
                <Section title="Pendapatan Operasional" rows={lr.pendapatan.rows} />
                <Total label="Total Pendapatan" value={lr.pendapatan.total} />

                <Section title="Beban Pokok Penjualan" rows={lr.bebanPokok.rows} negative />
                <Total label="Total Beban Pokok" value={`(${lr.bebanPokok.total})`} />

                <SubTotal label="LABA KOTOR" value={lr.labaKotor} />

                <Section title="Beban Operasional" rows={lr.bebanOperasi.rows} negative />
                <Total label="Total Beban Operasi" value={`(${lr.bebanOperasi.total})`} />

                <SubTotal label="LABA USAHA" value={lr.labaUsaha} />

                {lr.pendapatanLain.rows.length > 0 && (
                  <>
                    <Section title="Pendapatan Lain-lain" rows={lr.pendapatanLain.rows} />
                    <Total label="Total Pendapatan Lain" value={lr.pendapatanLain.total} />
                  </>
                )}
                {lr.bebanLain.rows.length > 0 && (
                  <>
                    <Section title="Beban Lain-lain" rows={lr.bebanLain.rows} negative />
                    <Total label="Total Beban Lain" value={`(${lr.bebanLain.total})`} />
                  </>
                )}

                <SubTotal label="LABA SEBELUM PAJAK" value={lr.labaSebelumPajak} />

                {Number(lr.bebanPajak) > 0 && (
                  <Total label="(Beban PPh Badan)" value={`(${lr.bebanPajak})`} />
                )}

                <tr className="bg-wedel-900 text-cream-50">
                  <td colSpan={2} className="px-4 py-3 font-bold text-base">LABA BERSIH</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-base tabular-nums">{fmtRp(lr.labaBersih)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Section({ title, rows, negative }: { title: string; rows: Row[]; negative?: boolean }) {
  return (
    <>
      <tr className="bg-cream-50"><td colSpan={3} className="px-4 py-2 text-[11px] uppercase tracking-wider font-bold text-tanah-700">{title}</td></tr>
      {rows.length === 0 ? (
        <tr><td colSpan={3} className="px-4 py-1.5 text-tanah-400 text-xs italic pl-8">— tidak ada —</td></tr>
      ) : rows.map((r) => (
        <tr key={r.id}>
          <td className="px-4 py-1 font-mono text-xs text-tanah-500 pl-8 w-20">{r.kode}</td>
          <td className="px-2 py-1 text-tanah-700 text-sm">{r.nama}</td>
          <td className={`px-4 py-1 text-right font-mono tabular-nums text-sm ${negative ? 'text-bata-700' : ''}`}>
            {negative ? `(${fmtRp(r.nilai).replace('Rp ', '')})` : fmtRp(r.nilai)}
          </td>
        </tr>
      ))}
    </>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <tr className="bg-cream-100">
      <td colSpan={2} className="px-4 py-1.5 text-sm font-semibold text-tanah-700">{label}</td>
      <td className="px-4 py-1.5 text-right font-mono tabular-nums text-sm font-semibold">{value.startsWith('(') ? value : fmtRp(value)}</td>
    </tr>
  );
}

function SubTotal({ label, value }: { label: string; value: string }) {
  return (
    <tr className="bg-cream-200 border-y-2 border-cream-400">
      <td colSpan={2} className="px-4 py-2 font-display text-base font-semibold text-wedel-900">{label}</td>
      <td className="px-4 py-2 text-right font-display font-semibold text-base text-wedel-900 tabular-nums">{fmtRp(value)}</td>
    </tr>
  );
}
