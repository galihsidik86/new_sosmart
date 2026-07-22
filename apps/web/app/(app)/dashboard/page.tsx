import Link from 'next/link';
import type { Route } from 'next';
import { getSession, getActiveTenantId } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { PageHeader, PageContainer, StatCard, Card, Badge, Icon } from '@/components/ui';
import { LiveRefresh } from '@/components/LiveRefresh';

interface PeriodYear {
  id: string; kode: string; status: string;
  periods: Array<{ id: string; label: string; status: string; no: number; startDate: string; endDate: string }>;
}
interface IndustriMaster { id: string; kode: string; nama: string }
interface LrpRow {
  project: { id: string; kode: string; nama: string; status: string; industri: { kode: string; nama: string } | null };
  pendapatan: string; bebanPokok: string; bebanOperasi: string; labaBersih: string; marginPersen: string;
}
interface Lrp {
  periode: { id: string; label: string };
  ytd: boolean;
  rows: LrpRow[];
  total: { pendapatan: string; bebanPokok: string; bebanOperasi: string; labaBersih: string; marginPersen: string };
}

function compactRp(v: string | number): string {
  const n = Number(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}Rp ${(abs / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1e6) return `${sign}Rp ${(abs / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
}

const pct = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });

export default async function Dashboard() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;

  const [years, industriMaster, cabang, items, customers] = await Promise.all([
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
    apiFetch<IndustriMaster[]>('/industri', { tenantId }).catch(() => [] as IndustriMaster[]),
    apiFetch<unknown[]>('/cabang', { tenantId }).catch(() => []),
    apiFetch<unknown[]>('/items', { tenantId }).catch(() => []),
    apiFetch<unknown[]>('/customers', { tenantId }).catch(() => []),
  ]);

  const fy = years[0];
  const periods = fy?.periods ?? [];
  const refPeriod = periods.find((p) => p.status === 'OPEN') ?? periods[periods.length - 1];
  const idByKode = new Map(industriMaster.map((i) => [i.kode, i.id]));

  let lrp: Lrp | null = null;
  if (refPeriod) {
    lrp = await apiFetch<Lrp>(
      `/reports/laba-rugi-proyek?periodId=${refPeriod.id}&ytd=true`,
      { tenantId },
    ).catch(() => null);
  }
  const rows = lrp?.rows ?? [];
  const totalPend = lrp ? Number(lrp.total.pendapatan) : 0;
  const totalLaba = lrp ? Number(lrp.total.labaBersih) : 0;
  const margin = totalPend > 0 ? (totalLaba / totalPend) * 100 : 0;

  // ---- Agregasi per industri ----
  type Agg = { kode: string | null; nama: string; pendapatan: number; laba: number; count: number };
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const k = r.project.industri?.kode ?? '__none';
    const cur = map.get(k) ?? {
      kode: r.project.industri?.kode ?? null,
      nama: r.project.industri?.nama ?? 'Tanpa Industri',
      pendapatan: 0, laba: 0, count: 0,
    };
    cur.pendapatan += Number(r.pendapatan);
    cur.laba += Number(r.labaBersih);
    cur.count += 1;
    map.set(k, cur);
  }
  const industriRows = [...map.values()].sort((a, b) => b.pendapatan - a.pendapatan);
  const maxPend = Math.max(1, ...industriRows.map((i) => i.pendapatan));

  const topProjects = [...rows]
    .sort((a, b) => Number(b.pendapatan) - Number(a.pendapatan))
    .slice(0, 8);

  const hasData = rows.length > 0 && totalPend > 0;
  const drill = (kode: string | null): Route =>
    (kode && idByKode.get(kode)
      ? `/laporan/laba-rugi-proyek?periodId=${refPeriod?.id}&ytd=true&industriId=${idByKode.get(kode)}`
      : `/laporan/laba-rugi-proyek?periodId=${refPeriod?.id}&ytd=true`) as Route;

  return (
    <>
      <LiveRefresh intervalMs={8000} />
      <PageContainer>
        <PageHeader
          title={`Halo, ${s.user.nama.split(' ')[0]}`}
          subtitle={
            <>Kinerja <span className="font-semibold text-wedel-900">per industri</span> — {s.tenantNama}, Tahun Buku {fy?.kode ?? '—'} s/d <span className="font-semibold text-wedel-900">{refPeriod?.label ?? '—'}</span> (YTD).</>
          }
        />

        {!hasData ? (
          <Card padding="lg" className="text-center py-12">
            <div className="mx-auto mb-3 w-12 h-12 rounded-xl bg-cream-100 grid place-items-center text-tanah-300">
              <Icon name="chart" size={22} />
            </div>
            <div className="font-semibold text-tanah-700">Belum ada data kinerja proyek</div>
            <p className="text-sm text-tanah-500 mt-1 max-w-md mx-auto">
              Tetapkan <b>jenis industri</b> di master Project dan catat transaksi bermuatan proyek untuk melihat kinerja per industri di sini.
            </p>
            <Link href={'/master/project' as Route} className="inline-block mt-4 text-sm text-sogan-500 font-semibold hover:underline">
              Kelola Project →
            </Link>
          </Card>
        ) : (
          <>
            {/* Hero KPI */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <StatCard label="Pendapatan (YTD)" value={compactRp(totalPend)} icon={<Icon name="coins" size={18} />} />
              <StatCard label="Laba Bersih (YTD)" value={compactRp(totalLaba)} tone={totalLaba < 0 ? 'danger' : 'success'} icon={<Icon name="trending-up" size={18} />} />
              <StatCard label="Margin Bersih" value={`${pct(margin)}%`} tone="muted" />
              <StatCard label="Industri Aktif" value={String(industriRows.length)} tone="muted" icon={<Icon name="building" size={18} />} />
              <StatCard label="Project" value={String(rows.length)} tone="muted" icon={<Icon name="folder" size={18} />} />
            </section>

            {/* Kinerja per Industri (fokus utama) */}
            <section className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-xl font-semibold text-wedel-900">Kinerja per Industri</h2>
                <span className="text-xs text-tanah-500">klik kartu → detail proyek industri</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {industriRows.map((ind) => (
                  <Link key={ind.kode ?? 'none'} href={drill(ind.kode)} className="group block">
                    <Card className="h-full transition duration-fast ease-sembada group-hover:shadow-md group-hover:border-sogan-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-display text-lg font-semibold text-wedel-900 leading-tight line-clamp-2">{ind.nama}</div>
                          <div className="text-xs text-tanah-500 mt-0.5">{ind.count} project</div>
                        </div>
                        <Badge variant={ind.laba < 0 ? 'danger' : 'success'} size="sm">
                          {pct(ind.pendapatan > 0 ? (ind.laba / ind.pendapatan) * 100 : 0)}%
                        </Badge>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="text-tanah-500 uppercase tracking-wider font-bold">Pendapatan</span>
                          <span className="font-mono tabular-nums font-semibold text-tanah-700 whitespace-nowrap">{compactRp(ind.pendapatan)}</span>
                        </div>
                        <div className="h-2 bg-cream-200 rounded-full mt-1.5 overflow-hidden">
                          <div className="h-2 bg-wedel-900 rounded-full transition-all" style={{ width: `${(ind.pendapatan / maxPend) * 100}%` }} />
                        </div>
                        <div className="flex items-baseline justify-between gap-2 text-xs mt-2.5">
                          <span className="text-tanah-500 uppercase tracking-wider font-bold">Laba Bersih</span>
                          <span className={`font-mono tabular-nums font-semibold whitespace-nowrap ${ind.laba < 0 ? 'text-bata-700' : 'text-padi-700'}`}>{compactRp(ind.laba)}</span>
                        </div>
                      </div>

                      <div className="mt-3 text-[11px] font-semibold text-sogan-500 group-hover:underline">
                        Lihat detail proyek →
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>

            {/* Project teratas (klik → detail project) */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <Card padding="lg" className="lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-lg font-semibold text-wedel-900">Project Teratas</h2>
                  <span className="text-xs text-tanah-500">klik baris → detail project</span>
                </div>
                <div className="divide-y divide-cream-200">
                  {topProjects.map((r) => {
                    const laba = Number(r.labaBersih);
                    return (
                      <Link
                        key={r.project.id}
                        href={`/master/project/${r.project.id}` as Route}
                        className="flex items-center justify-between gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-cream-50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-tanah-700 truncate">{r.project.nama}</div>
                          <div className="text-xs text-tanah-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono">{r.project.kode}</span>
                            {r.project.industri && <Badge variant="neutral" size="sm">{r.project.industri.nama}</Badge>}
                          </div>
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <div className="font-mono tabular-nums font-semibold text-tanah-700">{compactRp(r.pendapatan)}</div>
                          <div className={`text-xs font-mono tabular-nums ${laba < 0 ? 'text-bata-600' : 'text-padi-700'}`}>
                            Laba {compactRp(laba)} · {r.marginPersen}%
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>

              {/* Ringkasan singkat + master */}
              <Card padding="lg">
                <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-4">Ringkasan · YTD</div>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-tanah-500">Pendapatan</dt>
                    <dd className="font-mono tabular-nums font-semibold text-tanah-700 whitespace-nowrap">{compactRp(totalPend)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-tanah-500">Laba Bersih</dt>
                    <dd className={`font-mono tabular-nums font-semibold whitespace-nowrap ${totalLaba < 0 ? 'text-bata-700' : 'text-padi-700'}`}>{compactRp(totalLaba)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-cream-200 pb-3">
                    <dt className="text-tanah-500">Margin Bersih</dt>
                    <dd className="font-mono tabular-nums font-semibold text-emas-700 whitespace-nowrap">{pct(margin)}%</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-tanah-500">Jumlah Industri</dt>
                    <dd className="font-mono tabular-nums font-semibold text-wedel-900">{industriRows.length}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-tanah-500">Cabang · Item · Pelanggan</dt>
                    <dd className="font-mono tabular-nums text-tanah-700">{cabang.length} · {items.length} · {customers.length}</dd>
                  </div>
                </dl>
                <Link href={'/laporan/laba-rugi-proyek' as Route} className="inline-block mt-4 text-sm text-sogan-500 font-semibold hover:underline">
                  Laba Rugi per Proyek →
                </Link>
              </Card>
            </section>
          </>
        )}
      </PageContainer>
    </>
  );
}
