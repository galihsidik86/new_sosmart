import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp, fmtTanggal } from '@/lib/format';

type Jenis = 'PPH_21' | 'PPH_23' | 'PPH_4_AYAT_2' | 'PPH_22' | 'PPH_15' | 'PPH_25' | 'PPH_26' | 'PPH_29';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Row {
  nomor: string | null;
  tanggal: string;
  pihakNama: string;
  pihakNpwp: string | null;
  pihakNik: string | null;
  dpp: string;
  tarifPersen: string;
  pph: string;
  sumberType: string | null;
}
interface Spt {
  periode: { id: string; label: string };
  jenisPph: Jenis;
  rows: Row[];
  totalDpp: string;
  totalPph: string;
  countTerbit: number;
  countDibatalkan: number;
}

export default async function SptPphPage({
  searchParams,
}: { searchParams: Promise<{ periodId?: string; jenisPph?: Jenis }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id;
  const jenisPph = sp.jenisPph ?? 'PPH_23';

  let spt: Spt | null = null;
  if (periodId) {
    spt = await apiFetch<Spt>(
      `/spt/pph?periodId=${periodId}&jenisPph=${jenisPph}`,
      { tenantId },
    );
  }

  return (
    <>
      <Topbar breadcrumb={`SPT Masa ${jenisPph.replace('_', ' ')}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-wedel-900">
            SPT Masa PPh
          </h1>
          <p className="text-sm text-tanah-500 mt-1">
            Rekap bukti potong PPh per masa pajak — format e-Bupot Unifikasi.
          </p>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-3 shadow-sm text-sm">
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">Periode:</span>
          <select name="periodId" defaultValue={periodId}
            className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label} ({p.status})</option>
            ))}
          </select>
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold ml-2">Jenis:</span>
          <select name="jenisPph" defaultValue={jenisPph}
            className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
            <option value="PPH_21">PPh 21 (gaji)</option>
            <option value="PPH_23">PPh 23 (jasa)</option>
            <option value="PPH_4_AYAT_2">PPh 4(2) (final)</option>
            <option value="PPH_22">PPh 22</option>
            <option value="PPH_26">PPh 26 (WP LN)</option>
            <option value="PPH_25">PPh 25 (angsuran)</option>
          </select>
          <button className="px-3 py-1.5 bg-cream-200 border border-cream-400 rounded-md text-xs font-semibold text-tanah-700">
            Tampilkan
          </button>
          <Link href="/pajak/bukti-potong" className="ml-auto text-xs text-sogan-500 font-semibold hover:underline">
            Kelola bukti potong →
          </Link>
        </form>

        {spt && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Stat label="Total DPP" value={fmtRp(spt.totalDpp)} />
              <Stat label={`Total ${spt.jenisPph.replace('_', ' ')} terutang`} value={fmtRp(spt.totalPph)} tone="bata" big />
              <Stat label="Jumlah Bukti Terbit" value={`${spt.countTerbit}`} />
            </div>

            <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 font-display text-lg font-semibold text-wedel-900">
                Daftar Bukti Potong — {spt.periode.label}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-white text-left">
                  <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                    <th className="px-3 py-2 font-bold">No Bupot</th>
                    <th className="px-3 py-2 font-bold">Tgl</th>
                    <th className="px-3 py-2 font-bold">Pihak Dipotong</th>
                    <th className="px-3 py-2 font-bold">NPWP / NIK</th>
                    <th className="px-3 py-2 font-bold text-right">DPP</th>
                    <th className="px-3 py-2 font-bold text-right">Tarif</th>
                    <th className="px-3 py-2 font-bold text-right">PPh</th>
                    <th className="px-3 py-2 font-bold">Sumber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {spt.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-cream-50">
                      <td className="px-3 py-1.5 font-mono text-xs text-sogan-500">{r.nomor}</td>
                      <td className="px-3 py-1.5 text-xs text-tanah-500">{fmtTanggal(r.tanggal)}</td>
                      <td className="px-3 py-1.5">{r.pihakNama}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-tanah-500">
                        {r.pihakNpwp ? fmtNpwp(r.pihakNpwp) : r.pihakNik ? fmtNpwp(r.pihakNik) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(r.dpp)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-tanah-500">{r.tarifPersen}%</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold text-bata-700">{fmtRp(r.pph)}</td>
                      <td className="px-3 py-1.5 text-xs text-tanah-500">{r.sumberType?.replace(/_/g, ' ') ?? '—'}</td>
                    </tr>
                  ))}
                  {spt.rows.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-tanah-500">
                      Tidak ada bukti potong {spt.jenisPph.replace('_', ' ')} di periode ini.
                    </td></tr>
                  )}
                </tbody>
                <tfoot className="bg-cream-50 font-bold text-tanah-700">
                  <tr><td colSpan={4} className="px-3 py-2 text-right">TOTAL</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(spt.totalDpp)}</td>
                    <td />
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(spt.totalPph)}</td>
                    <td /></tr>
                </tfoot>
              </table>
              {spt.countDibatalkan > 0 && (
                <div className="px-5 py-2 bg-cream-50 border-t border-cream-200 text-xs text-tanah-500">
                  {spt.countDibatalkan} bukti potong dibatalkan (tidak masuk total).
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: 'padi' | 'bata'; big?: boolean }) {
  const cls = tone === 'padi' ? 'text-padi-700' : tone === 'bata' ? 'text-bata-700' : 'text-wedel-900';
  return (
    <div className="bg-white border border-cream-200 rounded-xl p-5 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-tanah-500 font-bold">{label}</div>
      <div className={`font-display font-semibold tabular-nums mt-2 ${cls} ${big ? 'text-3xl' : 'text-xl'}`}>
        {value}
      </div>
    </div>
  );
}
