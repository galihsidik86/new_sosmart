import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Line { label: string; nilai: string }
interface AK {
  periode: { id: string; label: string; startDate: string; endDate: string };
  operasi: { rows: Line[]; total: string };
  investasi: { rows: Line[]; total: string };
  pendanaan: { rows: Line[]; total: string };
  kenaikanKasBersih: string;
  kasAwal: string;
  kasAkhir: string;
  balanced: boolean;
  selisih: string;
}

export default async function ArusKasPage({
  searchParams,
}: { searchParams: Promise<{ periodId?: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;

  let ak: AK | null = null;
  if (periodId) {
    ak = await apiFetch<AK>(`/reports/arus-kas?periodId=${periodId}`, { tenantId });
  }

  return (
    <>
      <Topbar breadcrumb="Arus Kas" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-wedel-900">
            Laporan Arus Kas
          </h1>
          <p className="text-sm text-tanah-500 mt-1">
            Metode Tidak Langsung — 3 aktivitas: Operasi, Investasi, Pendanaan. YTD dari awal tahun buku.
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

        {ak && (
          <>
            <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-4">
              <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 text-center">
                <div className="font-display text-xl font-semibold text-wedel-900">{s.tenantNama}</div>
                <div className="text-sm text-tanah-500">Laporan Arus Kas (Metode Tidak Langsung)</div>
                <div className="text-xs text-tanah-500">
                  {fmtTanggal(ak.periode.startDate)} s/d {fmtTanggal(ak.periode.endDate)}
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-cream-200">
                  <SectionTitle title="A. AKTIVITAS OPERASI" />
                  {ak.operasi.rows.map((l, i) => <LineRow key={i} l={l} />)}
                  <Total label="Kas Bersih dari Aktivitas Operasi" value={ak.operasi.total} />

                  <SectionTitle title="B. AKTIVITAS INVESTASI" />
                  {ak.investasi.rows.map((l, i) => <LineRow key={i} l={l} />)}
                  <Total label="Kas Bersih dari Aktivitas Investasi" value={ak.investasi.total} />

                  <SectionTitle title="C. AKTIVITAS PENDANAAN" />
                  {ak.pendanaan.rows.map((l, i) => <LineRow key={i} l={l} />)}
                  <Total label="Kas Bersih dari Aktivitas Pendanaan" value={ak.pendanaan.total} />

                  <tr className="bg-cream-200 border-y-2 border-cream-400">
                    <td className="px-4 py-2 font-display text-base font-semibold text-wedel-900">KENAIKAN (PENURUNAN) KAS BERSIH</td>
                    <td className="px-4 py-2 text-right font-display font-semibold text-base text-wedel-900 tabular-nums">{fmtRp(ak.kenaikanKasBersih)}</td>
                  </tr>
                  <tr><td className="px-4 py-1.5 text-sm text-tanah-700">Kas & Bank Awal Periode</td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{fmtRp(ak.kasAwal)}</td></tr>
                  <tr className="bg-wedel-900 text-cream-50">
                    <td className="px-4 py-3 font-bold text-base">KAS & BANK AKHIR PERIODE</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-base tabular-nums">{fmtRp(ak.kasAkhir)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={`rounded-xl p-4 text-sm font-semibold ${
              ak.balanced ? 'bg-padi-100 text-padi-700' : 'bg-bata-100 text-bata-700'
            }`}>
              {ak.balanced
                ? '✓ Konsisten: kas awal + perubahan = kas akhir'
                : `⚠ Selisih: ${fmtRp(ak.selisih)} — kemungkinan ada transaksi non-jurnal atau jurnal yang belum di-POST`}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <tr className="bg-cream-50">
      <td colSpan={2} className="px-4 py-2 text-[11px] uppercase tracking-wider font-bold text-tanah-700">{title}</td>
    </tr>
  );
}
function LineRow({ l }: { l: Line }) {
  const n = Number(l.nilai);
  return (
    <tr>
      <td className="px-4 py-1 text-tanah-700 text-sm pl-8">{l.label}</td>
      <td className={`px-4 py-1 text-right font-mono tabular-nums text-sm ${n < 0 ? 'text-bata-700' : n > 0 ? '' : 'text-tanah-400'}`}>
        {n === 0 ? '—' : fmtRp(Math.abs(n)).replace('Rp ', n < 0 ? '(' : '') + (n < 0 ? ')' : '')}
      </td>
    </tr>
  );
}
function Total({ label, value }: { label: string; value: string }) {
  const n = Number(value);
  return (
    <tr className="bg-cream-100">
      <td className="px-4 py-1.5 text-sm font-semibold text-tanah-700">{label}</td>
      <td className={`px-4 py-1.5 text-right font-mono tabular-nums text-sm font-semibold ${n < 0 ? 'text-bata-700' : ''}`}>
        {n === 0 ? '—' : fmtRp(Math.abs(n)).replace('Rp ', n < 0 ? '(' : '') + (n < 0 ? ')' : '')}
      </td>
    </tr>
  );
}
