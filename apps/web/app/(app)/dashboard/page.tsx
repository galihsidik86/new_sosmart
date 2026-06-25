import { getSession, getActiveTenantId } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { Topbar } from '@/components/Topbar';

interface CabangRow {
  id: string;
  kode: string;
  nama: string;
  isPusat: boolean;
  npwpCabang: string | null;
}
interface ItemRow {
  id: string;
  kode: string;
  nama: string;
  klasifikasiPpn: string;
  isJasa: boolean;
}
interface VendorRow { id: string; nama: string; isPkp: boolean }
interface CustomerRow { id: string; nama: string; tipe: string }
interface PeriodYear {
  id: string;
  kode: string;
  status: string;
  periods: Array<{ id: string; label: string; status: string; no: number }>;
}

export default async function Dashboard() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;

  const [cabang, items, vendors, customers, years] = await Promise.all([
    apiFetch<CabangRow[]>('/cabang', { tenantId }),
    apiFetch<ItemRow[]>('/items', { tenantId }),
    apiFetch<VendorRow[]>('/vendors', { tenantId }),
    apiFetch<CustomerRow[]>('/customers', { tenantId }),
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
  ]);

  const fy = years[0];
  const periodAktif = fy?.periods.find((p) => p.status === 'OPEN');
  const nClosed = fy?.periods.filter((p) => p.status === 'CLOSED').length ?? 0;

  return (
    <>
      <Topbar
        breadcrumb="Dashboard"
        tenantNama={s.tenantNama!}
        periodeLabel={periodAktif?.label}
      />
      <div className="px-8 py-8 max-w-7xl mx-auto w-full">
        <h1 className="font-display text-4xl font-semibold text-wedel-900 mb-2">
          Halo, {s.user.nama.split(' ')[0]}
        </h1>
        <p className="text-tanah-500 mb-8">
          Fase 2 aktif — master data & periode buku siap dipakai.
        </p>

        <section className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Cabang" value={String(cabang.length)} />
          <StatCard label="Item" value={String(items.length)} />
          <StatCard label="Vendor" value={String(vendors.length)} />
          <StatCard label="Pelanggan" value={String(customers.length)} />
        </section>

        <section className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-6">
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">
              Cabang
            </div>
            <ul className="space-y-2">
              {cabang.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between border-b border-cream-200 pb-2 last:border-0"
                >
                  <div>
                    <div className="font-semibold text-tanah-700">{c.nama}</div>
                    <div className="text-xs text-tanah-500 font-mono">
                      {c.kode}
                      {c.npwpCabang ? ` · NPWP ${c.npwpCabang}` : ''}
                    </div>
                  </div>
                  {c.isPusat && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emas-100 text-emas-700 px-2 py-1 rounded">
                      Pusat
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-6">
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">
              Tahun Buku {fy?.kode}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {fy?.periods.map((p) => (
                <div
                  key={p.id}
                  className={`p-2 rounded-md text-xs font-semibold ${
                    p.status === 'CLOSED'
                      ? 'bg-cream-200 text-tanah-500'
                      : p.status === 'CLOSING'
                      ? 'bg-emas-100 text-emas-700'
                      : 'bg-padi-100 text-padi-700'
                  }`}
                >
                  <div className="font-bold">{p.no}</div>
                  <div className="text-[9px] uppercase tracking-wide mt-0.5">
                    {p.status}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-tanah-500 mt-3">
              {nClosed} dari {fy?.periods.length} periode sudah ditutup.
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
      <div className="text-[11px] uppercase tracking-wider text-tanah-500 font-bold">
        {label}
      </div>
      <div className="font-display text-3xl font-semibold text-wedel-900 mt-2 tabular-nums">
        {value}
      </div>
    </div>
  );
}
