import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

type Status = 'DRAFT' | 'POSTED' | 'CANCELLED' | 'PARTIAL' | 'PAID';

interface Row {
  id: string;
  nomor: string | null;
  tanggal: string;
  alasan: string;
  status: Status;
  totalDeltaNilai: string;
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  _count: { lines: number };
}

export default async function PenyesuaianListPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const rows = await apiFetch<Row[]>('/stok-adjustments', { tenantId });

  return (
    <>
      <Topbar breadcrumb="Penyesuaian Stok" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Penyesuaian Stok (Opname)
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Selisih hasil opname fisik vs pencatatan. Auto-jurnal: delta+ → D Persediaan / K Pendapatan Penyesuaian, delta- → D Beban Penyesuaian / K Persediaan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/proxy/stok-adjustments/export.xlsx"
              className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
              Export Excel
            </a>
            <Link href="/persediaan/penyesuaian/baru"
              className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              + Opname Baru
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-4 py-3 font-bold">No / Tgl</th>
                <th className="px-4 py-3 font-bold">Alasan</th>
                <th className="px-4 py-3 font-bold">Cabang</th>
                <th className="px-4 py-3 font-bold">Periode</th>
                <th className="px-4 py-3 font-bold text-right">Δ Nilai</th>
                <th className="px-4 py-3 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {rows.map((r) => {
                const delta = Number(r.totalDeltaNilai);
                return (
                  <tr key={r.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/persediaan/penyesuaian/${r.id}`}
                        className="font-mono text-sogan-500 font-semibold hover:underline">
                        {r.nomor ?? '— draft —'}
                      </Link>
                      <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)} · {r._count.lines} item</div>
                    </td>
                    <td className="px-4 py-2.5 text-tanah-700">{r.alasan}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tanah-500">{r.cabang.kode}</td>
                    <td className="px-4 py-2.5 text-xs text-tanah-500">{r.fiscalPeriod.label}</td>
                    <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${delta < 0 ? 'text-bata-700' : 'text-padi-700'}`}>
                      {delta >= 0 ? '+' : ''}{fmtRp(delta)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        r.status === 'POSTED' ? 'bg-padi-100 text-padi-700' :
                        r.status === 'DRAFT' ? 'bg-emas-100 text-emas-700' :
                        'bg-cream-200 text-tanah-500'
                      }`}>{r.status}</span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-tanah-500">Belum ada opname.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
