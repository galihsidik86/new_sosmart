import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Row { id: string; kode: string; nama: string; nilai: string }
interface NRC {
  asOf: string;
  periode: { id: string; label: string };
  asetLancar: { rows: Row[]; total: string };
  asetTetap: { rows: Row[]; total: string };
  totalAset: string;
  liabilitasJangkaPendek: { rows: Row[]; total: string };
  liabilitasJangkaPanjang: { rows: Row[]; total: string };
  totalLiabilitas: string;
  ekuitas: { rows: Row[]; total: string };
  labaBerjalan: string;
  totalEkuitas: string;
  totalLiabilitasEkuitas: string;
  balanced: boolean;
  selisih: string;
}

export default async function NeracaPage({
  searchParams,
}: { searchParams: Promise<{ periodId?: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;

  let n: NRC | null = null;
  if (periodId) {
    n = await apiFetch<NRC>(`/reports/neraca?periodId=${periodId}`, { tenantId });
  }

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
              Posisi Keuangan per akhir periode. Aset = Liabilitas + Ekuitas.
            </p>
          </div>
          {periodId && (
            <a
              href={`/proxy/reports/neraca.pdf?periodId=${periodId}`}
              className="px-3 py-2 bg-bata-100 hover:bg-bata-200 border border-bata-300 rounded-lg text-sm font-semibold text-bata-700"
            >
              Cetak PDF
            </a>
          )}
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-3 shadow-sm text-sm">
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">Per akhir:</span>
          <select name="periodId" defaultValue={periodId}
            className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
            {years[0]?.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.status})</option>)}
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
                <div className="text-xs text-tanah-500">Per {fmtTanggal(n.asOf)}</div>
              </div>
              <div className="grid grid-cols-2 gap-0 divide-x divide-cream-200">
                {/* Aset */}
                <div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-cream-200">
                      <SectionRow title="ASET LANCAR" />
                      {n.asetLancar.rows.map((r) => <DataRow key={r.id} row={r} />)}
                      <Total label="Total Aset Lancar" value={n.asetLancar.total} />

                      <SectionRow title="ASET TETAP" />
                      {n.asetTetap.rows.map((r) => <DataRow key={r.id} row={r} />)}
                      <Total label="Total Aset Tetap" value={n.asetTetap.total} />

                      <tr className="bg-wedel-900 text-cream-50">
                        <td colSpan={2} className="px-4 py-3 font-bold text-base">TOTAL ASET</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-base tabular-nums">{fmtRp(n.totalAset)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Liab + Ekuitas */}
                <div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-cream-200">
                      <SectionRow title="LIABILITAS JANGKA PENDEK" />
                      {n.liabilitasJangkaPendek.rows.map((r) => <DataRow key={r.id} row={r} />)}
                      <Total label="Total Liab Jangka Pendek" value={n.liabilitasJangkaPendek.total} />

                      <SectionRow title="LIABILITAS JANGKA PANJANG" />
                      {n.liabilitasJangkaPanjang.rows.map((r) => <DataRow key={r.id} row={r} />)}
                      <Total label="Total Liab Jangka Panjang" value={n.liabilitasJangkaPanjang.total} />

                      <SectionRow title="EKUITAS" />
                      {n.ekuitas.rows.map((r) => <DataRow key={r.id} row={r} />)}
                      <tr><td colSpan={2} className="px-4 py-1 text-sm text-tanah-700 italic pl-8">Laba berjalan periode</td>
                        <td className="px-4 py-1 text-right font-mono tabular-nums">{fmtRp(n.labaBerjalan)}</td></tr>
                      <Total label="Total Ekuitas" value={n.totalEkuitas} />

                      <tr className="bg-wedel-900 text-cream-50">
                        <td colSpan={2} className="px-4 py-3 font-bold text-base">TOTAL LIABILITAS + EKUITAS</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-base tabular-nums">{fmtRp(n.totalLiabilitasEkuitas)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
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

function SectionRow({ title }: { title: string }) {
  return (
    <tr className="bg-cream-50">
      <td colSpan={3} className="px-4 py-2 text-[11px] uppercase tracking-wider font-bold text-tanah-700">{title}</td>
    </tr>
  );
}
function DataRow({ row }: { row: Row }) {
  return (
    <tr>
      <td className="px-4 py-1 font-mono text-xs text-tanah-500 pl-8 w-20">{row.kode}</td>
      <td className="px-2 py-1 text-tanah-700 text-sm">{row.nama}</td>
      <td className="px-4 py-1 text-right font-mono tabular-nums text-sm">{fmtRp(row.nilai)}</td>
    </tr>
  );
}
function Total({ label, value }: { label: string; value: string }) {
  return (
    <tr className="bg-cream-100">
      <td colSpan={2} className="px-4 py-1.5 text-sm font-semibold text-tanah-700">{label}</td>
      <td className="px-4 py-1.5 text-right font-mono tabular-nums text-sm font-semibold">{fmtRp(value)}</td>
    </tr>
  );
}
