import Link from 'next/link';
import { ReportActions } from '@/components/ReportActions';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { buildListHref } from '@/lib/list-query';
import { PageContainer, PageHeader, FilterLabel, Select, Button, StatusBanner, filterBarClass } from '@/components/ui';

const BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function bucketLabel(bucket: string, gran: 'harian' | 'bulanan'): string {
  if (gran === 'bulanan') {
    const [y, m] = bucket.split('-');
    return `${BULAN_ID[Number(m) - 1] ?? m} ${y}`;
  }
  return fmtTanggal(bucket);
}

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Project { id: string; kode: string; nama: string }
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
interface AKDBucket { bucket: string; masuk: string; keluar: string; bersih: string; saldoAkhir: string }
interface AKD {
  granularity: 'harian' | 'bulanan';
  periode: { id: string; label: string; startDate: string; endDate: string };
  kasAwal: string; totalMasuk: string; totalKeluar: string; kasAkhir: string;
  buckets: AKDBucket[];
}

export default async function ArusKasPage({
  searchParams,
}: { searchParams: Promise<{ periodId?: string; projectId?: string; detail?: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const [years, projects] = await Promise.all([
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }).catch(() => [] as Project[]),
  ]);
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;
  const projectId = sp.projectId ?? '';
  const projectQs = projectId ? `&projectId=${encodeURIComponent(projectId)}` : '';
  const detailGran: 'harian' | 'bulanan' = sp.detail === 'harian' ? 'harian' : 'bulanan';

  let ak: AK | null = null;
  let akd: AKD | null = null;
  if (periodId) {
    [ak, akd] = await Promise.all([
      apiFetch<AK>(`/reports/arus-kas?periodId=${periodId}${projectQs}`, { tenantId }),
      apiFetch<AKD>(`/reports/arus-kas-detail?periodId=${periodId}&granularity=${detailGran}${projectQs}`, { tenantId }).catch(() => null),
    ]);
  }

  return (
    <>
      <PageContainer size="form">
        <PageHeader
          title="Laporan Arus Kas"
          subtitle="Metode Tidak Langsung — 3 aktivitas: Operasi, Investasi, Pendanaan. YTD dari awal tahun buku."
          actions={
            periodId ? (
              <ReportActions
                xlsx={`/proxy/reports/arus-kas.xlsx?periodId=${periodId}${projectQs}`}
                pdf={`/proxy/reports/arus-kas.pdf?periodId=${periodId}${projectQs}`}
              />
            ) : undefined
          }
        />

        <form className={filterBarClass}>
          <input type="hidden" name="detail" value={detailGran} />
          <FilterLabel>s/d akhir</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.status})</option>)}
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
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Tampilkan</Button>
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
                    <td className="px-4 py-2 text-right font-display font-semibold text-base text-wedel-900 tabular-nums whitespace-nowrap">{fmtRp(ak.kenaikanKasBersih)}</td>
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

            {projectId && projectId !== 'none' ? (
              <StatusBanner tone="info">
                ℹ Tampilan per-proyek — Arus Kas metode tidak langsung tidak direkonsiliasi di
                level proyek karena kas, piutang, dan pajak tidak berdimensi proyek. Angka di atas
                mencerminkan arus dari baris pendapatan &amp; biaya yang ditandai proyek ini. Untuk
                analisis proyek, gunakan <span className="font-semibold">Laba Rugi per proyek</span> dan
                {' '}<span className="font-semibold">Anggaran vs Realisasi</span>.
              </StatusBanner>
            ) : (
              <StatusBanner tone={ak.balanced ? 'success' : 'danger'}>
                {ak.balanced
                  ? '✓ Konsisten: kas awal + perubahan = kas akhir'
                  : `⚠ Selisih: ${fmtRp(ak.selisih)} — kemungkinan ada transaksi non-jurnal atau jurnal yang belum di-POST`}
              </StatusBanner>
            )}
          </>
        )}

        {akd && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mt-6">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-display text-lg font-semibold text-wedel-900">Detail Arus Kas (Metode Langsung)</div>
                <div className="text-xs text-tanah-500">
                  Pergerakan kas &amp; bank aktual · {detailGran === 'bulanan' ? 'per bulan (YTD tahun buku)' : `per hari · ${akd.periode.label}`}
                </div>
              </div>
              <div className="inline-flex p-1 bg-cream-200 rounded-lg gap-1">
                {(['bulanan', 'harian'] as const).map((v) => {
                  const active = detailGran === v;
                  return (
                    <Link
                      key={v}
                      href={buildListHref('/laporan/arus-kas', { periodId, projectId: sp.projectId, detail: v })}
                      className={`px-3 py-1 rounded-md text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sogan-400 ${active ? 'bg-white text-sogan-500 shadow-xs' : 'text-tanah-500 hover:text-tanah-700'}`}
                    >
                      {v}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-cream-50">
                  <tr className="text-[10px] uppercase tracking-wider text-tanah-500">
                    <th className="px-4 py-2 text-left">{detailGran === 'bulanan' ? 'Bulan' : 'Tanggal'}</th>
                    <th className="px-4 py-2 text-right">Kas Masuk</th>
                    <th className="px-4 py-2 text-right">Kas Keluar</th>
                    <th className="px-4 py-2 text-right">Arus Bersih</th>
                    <th className="px-4 py-2 text-right">Saldo Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  <tr className="text-tanah-500">
                    <td className="px-4 py-1.5 italic">Saldo Awal</td>
                    <td /><td /><td />
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{fmtRp(akd.kasAwal)}</td>
                  </tr>
                  {akd.buckets.map((b) => {
                    const bersih = Number(b.bersih);
                    return (
                      <tr key={b.bucket} className="hover:bg-cream-50">
                        <td className="px-4 py-1.5 text-tanah-700 whitespace-nowrap">{bucketLabel(b.bucket, akd!.granularity)}</td>
                        <td className="px-4 py-1.5 text-right font-mono tabular-nums text-padi-700 whitespace-nowrap">{Number(b.masuk) ? fmtRp(b.masuk) : '—'}</td>
                        <td className="px-4 py-1.5 text-right font-mono tabular-nums text-bata-600 whitespace-nowrap">{Number(b.keluar) ? fmtRp(b.keluar) : '—'}</td>
                        <td className={`px-4 py-1.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${bersih < 0 ? 'text-bata-700' : 'text-tanah-700'}`}>{fmtRp(b.bersih)}</td>
                        <td className="px-4 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(b.saldoAkhir)}</td>
                      </tr>
                    );
                  })}
                  {akd.buckets.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-tanah-500">Tidak ada pergerakan kas pada rentang ini.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-wedel-900 text-cream-50 font-bold">
                    <td className="px-4 py-2.5">TOTAL</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(akd.totalMasuk)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(akd.totalKeluar)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(Number(akd.totalMasuk) - Number(akd.totalKeluar))}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtRp(akd.kasAkhir)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </PageContainer>
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
      <td className={`px-4 py-1 text-right font-mono tabular-nums text-sm whitespace-nowrap ${n < 0 ? 'text-bata-700' : n > 0 ? '' : 'text-tanah-500'}`}>
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
      <td className={`px-4 py-1.5 text-right font-mono tabular-nums text-sm font-semibold whitespace-nowrap ${n < 0 ? 'text-bata-700' : ''}`}>
        {n === 0 ? '—' : fmtRp(Math.abs(n)).replace('Rp ', n < 0 ? '(' : '') + (n < 0 ? ')' : '')}
      </td>
    </tr>
  );
}
