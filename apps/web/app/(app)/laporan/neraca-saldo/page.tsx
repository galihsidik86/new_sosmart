import { Fragment } from 'react';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain } from '@/lib/format';

type Kind =
  | 'ASET' | 'LIABILITAS' | 'EKUITAS'
  | 'PENDAPATAN' | 'BEBAN_POKOK' | 'BEBAN'
  | 'PENDAPATAN_LAIN' | 'BEBAN_LAIN';

interface TBRow {
  accountId: string;
  kode: string;
  nama: string;
  kind: Kind;
  normalBalance: 'DEBIT' | 'KREDIT';
  saldoAwalDebit: string;
  saldoAwalKredit: string;
  mutasiDebit: string;
  mutasiKredit: string;
  saldoAkhirDebit: string;
  saldoAkhirKredit: string;
}
interface TBResp {
  period: { id: string; label: string; startDate: string; endDate: string };
  rows: TBRow[];
  totals: {
    saldoAwalDebit: string; saldoAwalKredit: string;
    mutasiDebit: string; mutasiKredit: string;
    saldoAkhirDebit: string; saldoAkhirKredit: string;
  };
  balanced: boolean;
}
interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}

const KIND_ORDER: Kind[] = [
  'ASET', 'LIABILITAS', 'EKUITAS',
  'PENDAPATAN', 'BEBAN_POKOK', 'BEBAN',
  'PENDAPATAN_LAIN', 'BEBAN_LAIN',
];
const KIND_LABEL: Record<Kind, string> = {
  ASET: 'Aset',
  LIABILITAS: 'Liabilitas',
  EKUITAS: 'Ekuitas',
  PENDAPATAN: 'Pendapatan',
  BEBAN_POKOK: 'Beban Pokok',
  BEBAN: 'Beban Operasional',
  PENDAPATAN_LAIN: 'Pendapatan Lain-lain',
  BEBAN_LAIN: 'Beban Lain-lain',
};

export default async function NeracaSaldoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; hideZero?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id;

  let tb: TBResp | null = null;
  if (periodId) {
    const qs = new URLSearchParams({ periodId });
    if (sp.hideZero === 'true') qs.set('hideZero', 'true');
    tb = await apiFetch<TBResp>(`/trial-balance?${qs}`, { tenantId });
  }

  return (
    <>
      <Topbar breadcrumb="Neraca Saldo" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-2">
          Neraca Saldo
        </h1>
        <p className="text-sm text-tanah-500 mb-6">
          Semua akun postable dengan saldo awal, mutasi, dan saldo akhir periode.
          Total debit harus = total kredit.
        </p>

        <form className="bg-white border border-cream-200 rounded-xl p-4 mb-6 flex items-end gap-3 shadow-sm">
          <div className="flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Periode
            </label>
            <select
              name="periodId" defaultValue={periodId}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
            >
              {years[0]?.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.status})
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-tanah-700">
            <input
              type="checkbox" name="hideZero" value="true"
              defaultChecked={sp.hideZero === 'true'}
            />
            Sembunyikan akun nol
          </label>
          <button className="px-3 py-2 bg-cream-200 border border-cream-400 rounded-md text-sm font-semibold text-tanah-700">
            Tampilkan
          </button>
        </form>

        {tb && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 flex items-center justify-between">
              <div className="font-display text-xl font-semibold text-wedel-900">
                Periode {tb.period.label}
              </div>
              <div
                className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${
                  tb.balanced
                    ? 'bg-padi-100 text-padi-700'
                    : 'bg-bata-100 text-bata-700'
                }`}
              >
                {tb.balanced ? '✓ Balanced' : '⚠ Tidak balanced'}
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-tanah-500">
                  <th rowSpan={2} className="px-3 py-2 text-left font-bold border-b border-cream-200">Kode</th>
                  <th rowSpan={2} className="px-3 py-2 text-left font-bold border-b border-cream-200">Nama Akun</th>
                  <th colSpan={2} className="px-3 py-1.5 text-center font-bold bg-cream-50 border-b border-cream-200">
                    Saldo Awal
                  </th>
                  <th colSpan={2} className="px-3 py-1.5 text-center font-bold bg-cream-100 border-b border-cream-200">
                    Mutasi
                  </th>
                  <th colSpan={2} className="px-3 py-1.5 text-center font-bold bg-cream-50 border-b border-cream-200">
                    Saldo Akhir
                  </th>
                </tr>
                <tr className="text-[10px] uppercase tracking-wider text-tanah-500">
                  <th className="px-3 py-1.5 text-right font-bold bg-cream-50 border-b border-cream-200">Debit</th>
                  <th className="px-3 py-1.5 text-right font-bold bg-cream-50 border-b border-cream-200">Kredit</th>
                  <th className="px-3 py-1.5 text-right font-bold bg-cream-100 border-b border-cream-200">Debit</th>
                  <th className="px-3 py-1.5 text-right font-bold bg-cream-100 border-b border-cream-200">Kredit</th>
                  <th className="px-3 py-1.5 text-right font-bold bg-cream-50 border-b border-cream-200">Debit</th>
                  <th className="px-3 py-1.5 text-right font-bold bg-cream-50 border-b border-cream-200">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {KIND_ORDER.map((kind) => {
                  const rows = tb!.rows.filter((r) => r.kind === kind);
                  if (rows.length === 0) return null;
                  return (
                    <Fragment key={kind}>
                      <tr className="bg-wedel-900/[0.03]">
                        <td colSpan={8} className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-tanah-700 font-bold">
                          {KIND_LABEL[kind]}
                        </td>
                      </tr>
                      {rows.map((r) => (
                        <tr key={r.accountId} className="border-b border-cream-200 hover:bg-cream-50">
                          <td className="px-3 py-1 font-mono text-tanah-700">{r.kode}</td>
                          <td className="px-3 py-1 text-tanah-700">{r.nama}</td>
                          <Cell v={r.saldoAwalDebit} bg="bg-cream-50" />
                          <Cell v={r.saldoAwalKredit} bg="bg-cream-50" />
                          <Cell v={r.mutasiDebit} bg="bg-cream-100" />
                          <Cell v={r.mutasiKredit} bg="bg-cream-100" />
                          <Cell v={r.saldoAkhirDebit} bg="bg-cream-50" />
                          <Cell v={r.saldoAkhirKredit} bg="bg-cream-50" />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-cream-300 bg-cream-100 font-bold text-tanah-700 text-sm">
                  <td colSpan={2} className="px-3 py-2 text-right">TOTAL</td>
                  <Cell v={tb.totals.saldoAwalDebit} />
                  <Cell v={tb.totals.saldoAwalKredit} />
                  <Cell v={tb.totals.mutasiDebit} />
                  <Cell v={tb.totals.mutasiKredit} />
                  <Cell v={tb.totals.saldoAkhirDebit} />
                  <Cell v={tb.totals.saldoAkhirKredit} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Cell({ v, bg }: { v: string; bg?: string }) {
  const n = Number(v);
  return (
    <td className={`px-3 py-1 text-right font-mono tabular-nums ${bg ?? ''}`}>
      {n > 0 ? fmtPlain(v) : ''}
    </td>
  );
}
