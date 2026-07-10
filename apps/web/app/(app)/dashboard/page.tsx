import { getSession, getActiveTenantId } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { Topbar } from '@/components/Topbar';
import { PageHeader, PageContainer, StatCard, Card, Badge } from '@/components/ui';

interface CabangRow { id: string; kode: string; nama: string; isPusat: boolean; npwpCabang: string | null }
interface PeriodYear {
  id: string; kode: string; status: string;
  periods: Array<{ id: string; label: string; status: string; no: number; startDate: string; endDate: string }>;
}
interface Sub { nilai: string }
interface Section { total: string }
interface Neraca { totalAset: Sub; totalLiabilitas: Sub; totalEkuitas: Sub; labaBerjalan: Sub }
interface LabaRugi { pendapatan: Section; bebanPokok: Section; labaKotor: Sub; bebanOperasi: Section; labaBersih: Sub }
interface Aging { totalSaldo: string }

function compactRp(v: string | number): string {
  const n = Number(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}Rp ${(abs / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1e6) return `${sign}Rp ${(abs / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
}

export default async function Dashboard() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;

  const [cabang, items, vendors, customers, years] = await Promise.all([
    apiFetch<CabangRow[]>('/cabang', { tenantId }),
    apiFetch<unknown[]>('/items', { tenantId }),
    apiFetch<unknown[]>('/vendors', { tenantId }),
    apiFetch<unknown[]>('/customers', { tenantId }),
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
  ]);

  const fy = years[0];
  const periods = fy?.periods ?? [];
  const periodAktif = periods.find((p) => p.status === 'OPEN');
  const refPeriod = periodAktif ?? periods[periods.length - 1];
  const nClosed = periods.filter((p) => p.status === 'CLOSED').length;

  // ---------- data keuangan (per periode acuan / YTD) ----------
  let neraca: Neraca | null = null;
  let lrYtd: LabaRugi | null = null;
  let arAging: Aging | null = null;
  let apAging: Aging | null = null;
  let monthly: Array<{ label: string; pendapatan: number; laba: number }> = [];

  if (refPeriod) {
    const asOf = String(refPeriod.endDate).slice(0, 10);
    const chartPeriods = periods.filter((p) => p.no <= refPeriod.no);
    const res = await Promise.all([
      apiFetch<Neraca>(`/reports/neraca?periodId=${refPeriod.id}`, { tenantId }).catch(() => null),
      apiFetch<LabaRugi>(`/reports/laba-rugi?periodId=${refPeriod.id}&ytd=true`, { tenantId }).catch(() => null),
      apiFetch<Aging>(`/reports/ar-aging?asOf=${asOf}`, { tenantId }).catch(() => null),
      apiFetch<Aging>(`/reports/ap-aging?asOf=${asOf}`, { tenantId }).catch(() => null),
      ...chartPeriods.map((p) =>
        apiFetch<LabaRugi>(`/reports/laba-rugi?periodId=${p.id}`, { tenantId })
          .then((d) => ({ label: p.label.slice(0, 3), pendapatan: Number(d.pendapatan.total), laba: Number(d.labaBersih.nilai) }))
          .catch(() => ({ label: p.label.slice(0, 3), pendapatan: 0, laba: 0 })),
      ),
    ]);
    neraca = res[0]; lrYtd = res[1]; arAging = res[2]; apAging = res[3];
    monthly = res.slice(4) as typeof monthly;
  }

  const pendapatanYtd = lrYtd ? Number(lrYtd.pendapatan.total) : 0;
  const labaYtd = lrYtd ? Number(lrYtd.labaBersih.nilai) : 0;
  const margin = pendapatanYtd > 0 ? (labaYtd / pendapatanYtd) * 100 : 0;
  const totalAset = neraca ? Number(neraca.totalAset.nilai) : 0;
  const piutang = arAging ? Number(arAging.totalSaldo) : 0;
  const utang = apAging ? Number(apAging.totalSaldo) : 0;
  const chartMax = Math.max(1, ...monthly.map((m) => Math.max(m.pendapatan, m.laba)));
  const hasFinance = !!refPeriod && pendapatanYtd + totalAset > 0;

  return (
    <>
      <Topbar breadcrumb="Dashboard" tenantNama={s.tenantNama!} periodeLabel={periodAktif?.label} />
      <PageContainer>
        <PageHeader
          title={`Halo, ${s.user.nama.split(' ')[0]}`}
          subtitle={
            hasFinance ? (
              <>Ringkasan keuangan {s.tenantNama} — Tahun Buku {fy?.kode}, posisi s/d <span className="font-semibold text-wedel-900">{refPeriod?.label}</span>. {nClosed} dari {periods.length} periode sudah ditutup.</>
            ) : (
              <>Tahun Buku {fy?.kode ?? '—'} siap. Mulai catat transaksi untuk melihat ringkasan keuangan di sini.</>
            )
          }
        />

        {hasFinance && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <StatCard label="Pendapatan YTD" value={compactRp(pendapatanYtd)} />
              <StatCard label="Laba Bersih YTD" value={compactRp(labaYtd)} tone={labaYtd < 0 ? 'danger' : 'success'} />
              <StatCard label="Margin Bersih" value={`${margin.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`} tone="warning" />
              <StatCard label="Total Aset" value={compactRp(totalAset)} />
              <StatCard label="Piutang Usaha" value={compactRp(piutang)} tone="muted" />
              <StatCard label="Utang Usaha" value={compactRp(utang)} tone="muted" />
            </section>

            <Card padding="lg" className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold">
                  Pendapatan &amp; Laba Bersih per Bulan
                </div>
                <div className="flex items-center gap-4 text-xs text-tanah-600">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-wedel-900 inline-block" /> Pendapatan</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-padi-500 inline-block" /> Laba Bersih</span>
                </div>
              </div>
              <div className="flex items-end gap-2 sm:gap-4 h-52 border-b border-cream-200">
                {monthly.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="w-full flex items-end justify-center gap-1 h-full">
                      <div
                        style={{ height: `${(m.pendapatan / chartMax) * 100}%` }}
                        className="w-4 sm:w-5 bg-wedel-900 rounded-t hover:opacity-80 transition-opacity"
                        title={`Pendapatan: ${compactRp(m.pendapatan)}`}
                      />
                      <div
                        style={{ height: `${(Math.max(0, m.laba) / chartMax) * 100}%` }}
                        className={`w-4 sm:w-5 rounded-t transition-opacity hover:opacity-80 ${m.laba < 0 ? 'bg-bata-500' : 'bg-padi-500'}`}
                        title={`Laba Bersih: ${compactRp(m.laba)}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 sm:gap-4 mt-1.5">
                {monthly.map((m, i) => (
                  <div key={i} className="flex-1 text-center text-[11px] font-semibold text-tanah-500">{m.label}</div>
                ))}
              </div>
            </Card>
          </>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Cabang" value={String(cabang.length)} tone="muted" />
          <StatCard label="Item / Jasa" value={String(items.length)} tone="muted" />
          <StatCard label="Vendor" value={String(vendors.length)} tone="muted" />
          <StatCard label="Pelanggan" value={String(customers.length)} tone="muted" />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding="lg">
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Cabang</div>
            <ul className="space-y-2">
              {cabang.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b border-cream-200 pb-2 last:border-0">
                  <div>
                    <div className="font-semibold text-tanah-700">{c.nama}</div>
                    <div className="text-xs text-tanah-500 font-mono">
                      {c.kode}{c.npwpCabang ? ` · NPWP ${c.npwpCabang}` : ''}
                    </div>
                  </div>
                  {c.isPusat && <Badge variant="warning">Pusat</Badge>}
                </li>
              ))}
            </ul>
          </Card>

          <Card padding="lg">
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Tahun Buku {fy?.kode}</div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 text-center">
              {periods.map((p) => (
                <div key={p.id} className={`p-2 rounded-md text-xs font-semibold ${
                  p.status === 'CLOSED' ? 'bg-cream-200 text-tanah-500'
                    : p.status === 'CLOSING' ? 'bg-emas-100 text-emas-700'
                      : 'bg-padi-100 text-padi-700'}`}>
                  <div className="font-bold">{p.no}</div>
                  <div className="text-[9px] uppercase tracking-wide mt-0.5">{p.status}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-tanah-500 mt-3">{nClosed} dari {periods.length} periode sudah ditutup.</div>
          </Card>
        </section>
      </PageContainer>
    </>
  );
}
