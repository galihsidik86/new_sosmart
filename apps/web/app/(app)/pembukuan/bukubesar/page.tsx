import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain, fmtTanggal } from '@/lib/format';

interface Account { id: string; kode: string; nama: string; isPostable: boolean }
interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Project { id: string; kode: string; nama: string }
interface LedgerRow {
  tanggal: string;
  nomor: string | null;
  deskripsi: string;
  lineDeskripsi: string | null;
  cabangKode: string;
  debit: string;
  kredit: string;
  saldo: string;
  journalId: string;
  sumber: string;
  sumberRef: string | null;
  linkBukti: string | null;
}
interface LedgerResp {
  account: { id: string; kode: string; nama: string; normalBalance: 'DEBIT' | 'KREDIT' };
  period: { id: string; label: string; startDate: string; endDate: string };
  saldoAwal: string;
  rows: LedgerRow[];
  totalDebit: string;
  totalKredit: string;
  saldoAkhir: string;
}

export default async function BukuBesarPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; periodId?: string; projectId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const [accounts, years, projects] = await Promise.all([
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }).catch(() => [] as Project[]),
  ]);
  const postable = accounts.filter((a) => a.isPostable);
  const accountId = sp.accountId ?? postable[0]?.id;
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id;
  const projectId = sp.projectId ?? '';

  let data: LedgerResp | null = null;
  if (accountId && periodId) {
    const qs = new URLSearchParams({ accountId, periodId });
    if (projectId) qs.set('projectId', projectId);
    data = await apiFetch<LedgerResp>(`/ledger?${qs}`, { tenantId });
  }
  const xlsxQs = new URLSearchParams();
  if (accountId) xlsxQs.set('accountId', accountId);
  if (periodId) xlsxQs.set('periodId', periodId);
  if (projectId) xlsxQs.set('projectId', projectId);

  return (
    <>
      <Topbar breadcrumb="Buku Besar" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-2">
              Buku Besar
            </h1>
            <p className="text-sm text-tanah-500">
              Saldo berjalan dihitung dari saldo awal akun + jurnal POSTED sebelum periode.
            </p>
          </div>
          {accountId && periodId && (
            <a href={`/proxy/ledger.xlsx?${xlsxQs}`}
              className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
              Export Excel
            </a>
          )}
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-4 mb-6 flex items-end gap-3 shadow-sm">
          <div className="flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Akun
            </label>
            <select
              name="accountId" defaultValue={accountId}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono"
            >
              {postable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kode}  {a.nama}
                </option>
              ))}
            </select>
          </div>
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
          {projects.length > 0 && (
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                Project
              </label>
              <select
                name="projectId" defaultValue={projectId}
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
              >
                <option value="">— semua —</option>
                <option value="none">— tanpa project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
                ))}
              </select>
            </div>
          )}
          <button className="px-3 py-2 bg-cream-200 border border-cream-400 rounded-md text-sm font-semibold text-tanah-700">
            Tampilkan
          </button>
        </form>

        {data && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-cream-50 border-b border-cream-200 flex items-center justify-between">
              <div>
                <div className="font-display text-xl font-semibold text-wedel-900 font-mono">
                  {data.account.kode}  {data.account.nama}
                </div>
                <div className="text-xs text-tanah-500 mt-1">
                  Saldo normal: <span className={data.account.normalBalance === 'DEBIT' ? 'text-padi-700 font-bold' : 'text-sogan-500 font-bold'}>
                    {data.account.normalBalance}
                  </span> · Periode {data.period.label}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold">
                  Saldo akhir
                </div>
                <div className="font-display text-2xl font-semibold text-wedel-900 tabular-nums">
                  {fmtPlain(data.saldoAkhir)}
                </div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                  <th className="px-3 py-2 font-bold">Tgl</th>
                  <th className="px-3 py-2 font-bold">No Jurnal</th>
                  <th className="px-3 py-2 font-bold">Keterangan</th>
                  <th className="px-3 py-2 font-bold">Cab.</th>
                  <th className="px-3 py-2 font-bold text-right">Debit</th>
                  <th className="px-3 py-2 font-bold text-right">Kredit</th>
                  <th className="px-3 py-2 font-bold text-right">Saldo</th>
                  <th className="px-3 py-2 font-bold text-center">Bukti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                <tr className="bg-cream-50">
                  <td colSpan={6} className="px-3 py-1.5 italic text-tanah-500 text-xs">
                    Saldo awal periode
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-tanah-700 tabular-nums">
                    {fmtPlain(data.saldoAwal)}
                  </td>
                  <td />
                </tr>
                {data.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-cream-50">
                    <td className="px-3 py-1.5 text-xs text-tanah-500">{fmtTanggal(r.tanggal)}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-sogan-500">{r.nomor}</td>
                    <td className="px-3 py-1.5">
                      <div className="text-tanah-700 text-xs">{r.deskripsi}</div>
                      {r.lineDeskripsi && (
                        <div className="text-tanah-400 text-[10px]">{r.lineDeskripsi}</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-tanah-500 font-mono">{r.cabangKode}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {Number(r.debit) > 0 ? fmtPlain(r.debit) : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {Number(r.kredit) > 0 ? fmtPlain(r.kredit) : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-tanah-700">
                      {fmtPlain(r.saldo)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {r.linkBukti
                        ? <a href={r.linkBukti} target="_blank" rel="noreferrer" className="inline-flex items-center px-1.5 py-0.5 rounded bg-padi-100 text-padi-700 hover:bg-padi-200 text-[11px] font-semibold" title="Buka bukti transaksi">🔗</a>
                        : <span className="text-tanah-300 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-tanah-500 text-sm">
                      Tidak ada mutasi di periode ini.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-cream-300 bg-cream-50 font-bold text-tanah-700 text-sm">
                  <td colSpan={4} className="px-3 py-2 text-right">TOTAL MUTASI</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(data.totalDebit)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(data.totalKredit)}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
