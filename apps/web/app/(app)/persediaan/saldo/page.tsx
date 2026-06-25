import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain, fmtRp } from '@/lib/format';

interface SaldoRow {
  item: { id: string; kode: string; nama: string; satuan: string; kategori: string | null };
  cabang: { id: string; kode: string; nama: string };
  qty: string;
  nilai: string;
  lastAt: string;
}
interface Cabang { id: string; kode: string; nama: string }

export default async function SaldoStokPage({
  searchParams,
}: {
  searchParams: Promise<{ cabangId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const cabang = await apiFetch<Cabang[]>('/cabang', { tenantId });
  const qs = sp.cabangId ? `?cabangId=${sp.cabangId}` : '';
  const rows = await apiFetch<SaldoRow[]>(`/inventory/saldo${qs}`, { tenantId });

  const totalNilai = rows.reduce((a, r) => a + Number(r.nilai), 0);

  return (
    <>
      <Topbar breadcrumb="Saldo Stok" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Saldo Stok
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Snapshot terkini per (item × cabang). Total nilai persediaan: <span className="font-semibold text-tanah-700">{fmtRp(totalNilai)}</span>
            </p>
          </div>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-2 shadow-sm text-sm">
          <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold mr-2">Cabang:</span>
          <Link href="/persediaan/saldo"
            className={`px-3 py-1.5 rounded-md font-semibold ${!sp.cabangId ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'}`}>
            Semua
          </Link>
          {cabang.map((c) => (
            <Link key={c.id}
              href={`/persediaan/saldo?cabangId=${c.id}`}
              className={`px-3 py-1.5 rounded-md font-semibold ${sp.cabangId === c.id ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'}`}>
              {c.kode}
            </Link>
          ))}
        </form>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-4 py-3 font-bold">Kode</th>
                <th className="px-4 py-3 font-bold">Nama</th>
                <th className="px-4 py-3 font-bold">Cabang</th>
                <th className="px-4 py-3 font-bold text-right">Qty</th>
                <th className="px-4 py-3 font-bold text-right">Nilai</th>
                <th className="px-4 py-3 font-bold text-right">Harga Pokok Rata</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {rows.map((r, i) => {
                const qty = Number(r.qty);
                const nilai = Number(r.nilai);
                const rata = qty > 0 ? nilai / qty : 0;
                return (
                  <tr key={i} className="hover:bg-cream-50">
                    <td className="px-4 py-2 font-mono text-tanah-700">{r.item.kode}</td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-tanah-700">{r.item.nama}</div>
                      <div className="text-xs text-tanah-500">{r.item.kategori ?? '—'} · {r.item.satuan}</div>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-tanah-500">{r.cabang.kode}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {fmtPlain(qty)} <span className="text-tanah-400 text-xs ml-1">{r.item.satuan}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(nilai)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-tanah-500">{fmtRp(rata)}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/persediaan/kartu-stok?itemId=${r.item.id}&cabangId=${r.cabang.id}`}
                        className="text-xs text-sogan-500 font-semibold hover:underline">
                        Kartu stok →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-tanah-500">Belum ada movement stok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
