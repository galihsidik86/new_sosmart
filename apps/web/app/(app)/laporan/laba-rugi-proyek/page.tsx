import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtPlain } from '@/lib/format';
import { PageContainer, PageHeader, FilterLabel, Select, Button, buttonClass, filterBarClass } from '@/components/ui';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface IndustriOpt { id: string; kode: string; nama: string }

interface AccRow { id: string; kode: string; nama: string; nilai: string }
interface Section { rows: AccRow[]; total: string }
interface Sub { nilai: string }
interface LRDetail {
  periode: { id: string; label: string };
  pendapatan: Section; bebanPokok: Section; labaKotor: Sub;
  bebanOperasi: Section; labaUsaha: Sub;
  pendapatanLain: Section; bebanLain: Section;
  labaSebelumPajak: Sub; bebanPajak: Sub; labaBersih: Sub;
}
interface Row {
  project: { id: string; kode: string; nama: string; status: string; industri: { kode: string; nama: string } | null };
  pendapatan: string; bebanPokok: string; bebanOperasi: string; labaBersih: string; marginPersen: string;
  detail: LRDetail;
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
  searchParams: Promise<{ periodId?: string; ytd?: string; industriId?: string; detail?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const [years, industri] = await Promise.all([
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
    apiFetch<IndustriOpt[]>('/industri', { tenantId }).catch(() => [] as IndustriOpt[]),
  ]);
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;
  const ytd = sp.ytd === 'true';
  const industriId = sp.industriId ?? '';
  const detail = sp.detail ?? ''; // '' = ringkasan saja | 'all' = detail semua | <projectId> = detail 1 proyek
  const qsExtra = `${ytd ? '&ytd=true' : ''}${industriId ? '&industriId=' + industriId : ''}`;

  let data: Resp | null = null;
  if (periodId) {
    data = await apiFetch<Resp>(`/reports/laba-rugi-proyek?periodId=${periodId}${qsExtra}`, { tenantId });
  }

  const detailRows =
    !data || !detail ? [] : detail === 'all' ? data.rows : data.rows.filter((r) => r.project.id === detail);

  return (
    <PageContainer size="list">
      <PageHeader
        title="Laba Rugi per Proyek"
        subtitle="Ringkasan seluruh proyek + laporan laba rugi detail (per akun) per proyek atau semua proyek sekaligus."
        actions={
          periodId ? (
            <a
              href={`/proxy/reports/laba-rugi-proyek.pdf?periodId=${periodId}${qsExtra}`}
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
        <div>
          <FilterLabel>Periode</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label} ({p.status})</option>
            ))}
          </Select>
        </div>
        {industri.length > 0 && (
          <div>
            <FilterLabel>Industri</FilterLabel>
            <Select name="industriId" defaultValue={industriId} fullWidth={false} className="min-w-[150px]">
              <option value="">Semua industri</option>
              {industri.map((i) => <option key={i.id} value={i.id}>{i.nama}</option>)}
            </Select>
          </div>
        )}
        <div>
          <FilterLabel>Detail akun</FilterLabel>
          <Select name="detail" defaultValue={detail} fullWidth={false} className="min-w-[190px]">
            <option value="">— ringkasan saja —</option>
            <option value="all">Semua proyek (detail per akun)</option>
            {(data?.rows ?? []).map((r) => (
              <option key={r.project.id} value={r.project.id}>{r.project.kode} — {r.project.nama}</option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-tanah-700 self-end">
          <input type="checkbox" name="ytd" value="true" defaultChecked={ytd} /> YTD
        </label>
        <Button type="submit" variant="secondary" size="sm" className="ml-auto self-end">Tampilkan</Button>
      </form>

      {/* ---------- Ringkasan (disembunyikan saat 1 proyek spesifik dipilih) ---------- */}
      {data && (!detail || detail === 'all') && (
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mt-4">
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
                      {r.project.industri && (
                        <span className="ml-2 text-[10px] text-wedel-700 bg-cream-100 border border-cream-200 rounded px-1.5 py-0.5">
                          {r.project.industri.nama}
                        </span>
                      )}
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

      {/* ---------- Detail per akun ---------- */}
      {detailRows.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-lg font-semibold text-wedel-900 mb-1">
            Laba Rugi Detail — {detail === 'all' ? `${detailRows.length} Proyek (Bulk)` : detailRows[0]?.project.nama}
          </h2>
          <p className="text-xs text-tanah-500 mb-3">Rincian per akun · {data?.periode.label}{data?.ytd ? ' (YTD)' : ''}</p>
          {detailRows.map((r) => <ProjectDetail key={r.project.id} row={r} />)}
        </div>
      )}
      {data && detail && detailRows.length === 0 && (
        <div className="mt-6 text-sm text-tanah-500">Proyek tidak ditemukan pada periode ini.</div>
      )}
    </PageContainer>
  );
}

function ProjectDetail({ row }: { row: Row }) {
  const d = row.detail;
  const rugi = Number(row.labaBersih) < 0;
  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-2.5 bg-cream-50 border-b border-cream-200 flex items-center justify-between gap-3">
        <div className="truncate">
          <span className="font-mono text-xs text-sogan-500">{row.project.kode}</span>{' '}
          <span className="font-semibold text-tanah-700">{row.project.nama}</span>
          {row.project.industri && (
            <span className="ml-2 text-[10px] text-wedel-700 bg-cream-100 border border-cream-200 rounded px-1.5 py-0.5">{row.project.industri.nama}</span>
          )}
        </div>
        <span className={`font-mono text-sm font-semibold whitespace-nowrap ${rugi ? 'text-bata-600' : 'text-padi-700'}`}>
          Laba bersih {fmtRp(row.labaBersih)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-cream-100">
            <SecRows label="Pendapatan" sec={d.pendapatan} />
            <SecRows label="Beban Pokok Penjualan" sec={d.bebanPokok} />
            <SubRow label="Laba Kotor" v={d.labaKotor.nilai} strong />
            <SecRows label="Beban Operasi" sec={d.bebanOperasi} />
            <SubRow label="Laba Usaha" v={d.labaUsaha.nilai} strong />
            {d.pendapatanLain.rows.length > 0 && <SecRows label="Pendapatan Lain" sec={d.pendapatanLain} />}
            {d.bebanLain.rows.length > 0 && <SecRows label="Beban Lain" sec={d.bebanLain} />}
            <SubRow label="Laba Sebelum Pajak" v={d.labaSebelumPajak.nilai} />
            <SubRow label="LABA (RUGI) BERSIH" v={d.labaBersih.nilai} grand />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SecRows({ label, sec }: { label: string; sec: Section }) {
  return (
    <>
      <tr className="bg-cream-50/60">
        <td className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-tanah-500 font-bold" colSpan={2}>{label}</td>
      </tr>
      {sec.rows.map((r) => (
        <tr key={r.id}>
          <td className="px-4 py-1 pl-8"><span className="font-mono text-xs text-tanah-500">{r.kode}</span> {r.nama}</td>
          <td className="px-4 py-1 text-right font-mono tabular-nums whitespace-nowrap">{fmtPlain(r.nilai)}</td>
        </tr>
      ))}
      {sec.rows.length === 0 && (
        <tr><td className="px-4 py-1 pl-8 text-xs text-tanah-300" colSpan={2}>— tidak ada —</td></tr>
      )}
      <tr className="border-t border-cream-200">
        <td className="px-4 py-1 pl-8 font-semibold text-tanah-700">Total {label}</td>
        <td className="px-4 py-1 text-right font-mono tabular-nums whitespace-nowrap font-semibold">{fmtRp(sec.total)}</td>
      </tr>
    </>
  );
}

function SubRow({ label, v, strong, grand }: { label: string; v: string; strong?: boolean; grand?: boolean }) {
  return (
    <tr className={grand ? 'bg-wedel-900 text-cream-50 font-bold' : strong ? 'bg-cream-50 font-semibold text-tanah-700' : ''}>
      <td className="px-4 py-2">{label}</td>
      <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(v)}</td>
    </tr>
  );
}
