import { Fragment } from 'react';
import { Topbar } from '@/components/Topbar';
import { ReportActions } from '@/components/ReportActions';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain } from '@/lib/format';
import { PageContainer, PageHeader, FilterLabel, Select, Button, filterBarClass } from '@/components/ui';

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
interface Project { id: string; kode: string; nama: string }

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
  searchParams: Promise<{ periodId?: string; hideZero?: string; projectId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const [years, projects] = await Promise.all([
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }).catch(() => [] as Project[]),
  ]);
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id;
  const projectId = sp.projectId ?? '';

  let tb: TBResp | null = null;
  if (periodId) {
    const qs = new URLSearchParams({ periodId });
    if (sp.hideZero === 'true') qs.set('hideZero', 'true');
    if (projectId) qs.set('projectId', projectId);
    tb = await apiFetch<TBResp>(`/trial-balance?${qs}`, { tenantId });
  }
  const xlsxQs = new URLSearchParams();
  if (periodId) xlsxQs.set('periodId', periodId);
  if (sp.hideZero === 'true') xlsxQs.set('hideZero', 'true');
  if (projectId) xlsxQs.set('projectId', projectId);

  return (
    <>
      <Topbar breadcrumb="Neraca Saldo" tenantNama={s.tenantNama!} />
      <PageContainer size="list">
        <PageHeader
          title="Neraca Saldo"
          subtitle="Semua akun postable dengan saldo awal, mutasi, dan saldo akhir periode. Total debit harus = total kredit."
          actions={
            periodId ? (
              <ReportActions xlsx={`/proxy/trial-balance.xlsx?${xlsxQs}`} />
            ) : undefined
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>Periode</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.status})
              </option>
            ))}
          </Select>
          {projects.length > 0 && (
            <>
              <FilterLabel>Project</FilterLabel>
              <Select name="projectId" defaultValue={projectId} fullWidth={false}>
                <option value="">— semua —</option>
                <option value="none">— tanpa project (overhead) —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
                ))}
              </Select>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-tanah-700">
            <input
              type="checkbox" name="hideZero" value="true"
              defaultChecked={sp.hideZero === 'true'}
            />
            Sembunyikan akun nol
          </label>
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Tampilkan</Button>
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
      </PageContainer>
    </>
  );
}

function Cell({ v, bg }: { v: string; bg?: string }) {
  const n = Number(v);
  return (
    <td className={`px-3 py-1 text-right font-mono tabular-nums whitespace-nowrap ${bg ?? ''}`}>
      {n > 0 ? fmtPlain(v) : ''}
    </td>
  );
}
