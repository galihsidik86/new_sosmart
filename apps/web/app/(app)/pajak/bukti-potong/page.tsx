import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp, fmtTanggal } from '@/lib/format';

type Jenis = 'PPH_21' | 'PPH_22' | 'PPH_23' | 'PPH_25' | 'PPH_26' | 'PPH_29' | 'PPH_4_AYAT_2' | 'PPH_15';
type Status = 'DRAFT' | 'TERBIT' | 'DIKIRIM_DJP' | 'DIBATALKAN';

interface Bupot {
  id: string;
  nomor: string | null;
  tanggal: string;
  jenisPph: Jenis;
  status: Status;
  pihakNama: string;
  pihakNpwp: string | null;
  dpp: string;
  tarifPersen: string;
  pph: string;
  sumberType: string | null;
  cabang: { kode: string };
}

const JENIS_BADGE: Record<Jenis, string> = {
  PPH_21: 'bg-sogan-50 text-sogan-500',
  PPH_22: 'bg-emas-100 text-emas-700',
  PPH_23: 'bg-padi-100 text-padi-700',
  PPH_25: 'bg-cream-200 text-tanah-500',
  PPH_26: 'bg-bata-100 text-bata-700',
  PPH_29: 'bg-cream-200 text-tanah-500',
  PPH_4_AYAT_2: 'bg-emas-100 text-emas-700',
  PPH_15: 'bg-cream-200 text-tanah-500',
};

export default async function BuktiPotongPage({
  searchParams,
}: {
  searchParams: Promise<{ jenisPph?: Jenis }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const qs = sp.jenisPph ? `?jenisPph=${sp.jenisPph}` : '';
  const rows = await apiFetch<Bupot[]>(`/bukti-potong${qs}`, { tenantId });

  const totalPph = rows
    .filter((r) => r.status !== 'DIBATALKAN')
    .reduce((a, r) => a + Number(r.pph), 0);

  return (
    <>
      <Topbar breadcrumb="Bukti Potong" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Bukti Potong (e-Bupot Unifikasi)
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {rows.length} bukti · total PPh dipotong:{' '}
              <span className="font-semibold text-tanah-700">{fmtRp(totalPph)}</span>
              <span className="text-xs ml-2">·  Auto-generate dari Payroll (PPh 21) & Faktur Pembelian (PPh 23)</span>
            </p>
          </div>
          <a href={`/proxy/bukti-potong/export.xlsx${qs}`}
            className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
            Export Excel
          </a>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-2 shadow-sm text-sm">
          {(['', 'PPH_21', 'PPH_23', 'PPH_4_AYAT_2'] as const).map((j) => (
            <Link key={j || 'all'}
              href={j ? `/pajak/bukti-potong?jenisPph=${j}` : '/pajak/bukti-potong'}
              className={`px-3 py-1.5 rounded-md font-semibold ${
                (sp.jenisPph ?? '') === j ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'
              }`}>
              {j ? j.replace('_', ' ') : 'Semua'}
            </Link>
          ))}
        </form>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-4 py-3 font-bold">No / Tgl</th>
                <th className="px-4 py-3 font-bold">Jenis</th>
                <th className="px-4 py-3 font-bold">Pihak Dipotong</th>
                <th className="px-4 py-3 font-bold">NPWP</th>
                <th className="px-4 py-3 font-bold text-right">DPP</th>
                <th className="px-4 py-3 font-bold text-right">Tarif</th>
                <th className="px-4 py-3 font-bold text-right">PPh</th>
                <th className="px-4 py-3 font-bold">Sumber</th>
                <th className="px-4 py-3 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {rows.map((r) => (
                <tr key={r.id} className={`hover:bg-cream-50 ${r.status === 'DIBATALKAN' ? 'opacity-50 line-through' : ''}`}>
                  <td className="px-4 py-2 font-mono text-xs text-sogan-500">{r.nomor ?? '—'}
                    <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${JENIS_BADGE[r.jenisPph]}`}>
                      {r.jenisPph.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-tanah-700">{r.pihakNama}</td>
                  <td className="px-4 py-2 font-mono text-xs text-tanah-500">{r.pihakNpwp ? fmtNpwp(r.pihakNpwp) : '—'}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(r.dpp)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-tanah-500">{r.tarifPersen}%</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-bata-700">{fmtRp(r.pph)}</td>
                  <td className="px-4 py-2 text-xs text-tanah-500">{r.sumberType?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      r.status === 'TERBIT' ? 'bg-padi-100 text-padi-700' :
                      r.status === 'DIKIRIM_DJP' ? 'bg-sogan-50 text-sogan-500' :
                      r.status === 'DRAFT' ? 'bg-emas-100 text-emas-700' :
                      'bg-cream-200 text-tanah-500'
                    }`}>{r.status}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-tanah-500">Belum ada bukti potong.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
