import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

type Tipe = 'RECEIPT' | 'PAYMENT' | 'TRANSFER';
type Status = 'DRAFT' | 'POSTED' | 'CANCELLED';

interface Row {
  id: string;
  nomor: string | null;
  tanggal: string;
  tipe: Tipe;
  status: Status;
  kontak: string | null;
  deskripsi: string | null;
  total: string;
  akunKasBank: { kode: string; nama: string };
  cabang: { kode: string };
}

const TIPE_BADGE: Record<Tipe, string> = {
  RECEIPT: 'bg-padi-100 text-padi-700',
  PAYMENT: 'bg-bata-100 text-bata-700',
  TRANSFER: 'bg-cream-300 text-tanah-700',
};

export default async function KasBankPage({
  searchParams,
}: { searchParams: Promise<{ tipe?: Tipe }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const qs = sp.tipe ? `?tipe=${sp.tipe}` : '';
  const rows = await apiFetch<Row[]>(`/cash-bank${qs}`, { tenantId });

  return (
    <>
      <Topbar breadcrumb="Kas / Bank" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Bukti Kas & Bank
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              BKM/BKK untuk kas keluar-masuk · BMT untuk mutasi antar akun · pelunasan AR/AP otomatis update status faktur.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/proxy/cash-bank/export.xlsx${sp.tipe ? '?tipe=' + sp.tipe : ''}`}
              className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
              Export Excel
            </a>
            <Link href="/transaksi/kas-bank/baru"
              className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              + Bukti Baru
            </Link>
          </div>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-2 shadow-sm text-sm">
          {(['', 'RECEIPT', 'PAYMENT', 'TRANSFER'] as const).map((t) => (
            <Link key={t || 'all'}
              href={t ? `/transaksi/kas-bank?tipe=${t}` : '/transaksi/kas-bank'}
              className={`px-3 py-1.5 rounded-md font-semibold ${
                (sp.tipe ?? '') === t ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'
              }`}>
              {t || 'Semua'}
            </Link>
          ))}
        </form>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-4 py-3 font-bold">No / Tgl</th>
                <th className="px-4 py-3 font-bold">Tipe</th>
                <th className="px-4 py-3 font-bold">Akun Kas/Bank</th>
                <th className="px-4 py-3 font-bold">Kontak / Deskripsi</th>
                <th className="px-4 py-3 font-bold text-right">Nilai</th>
                <th className="px-4 py-3 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-cream-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/transaksi/kas-bank/${r.id}`}
                      className="font-mono text-sogan-500 font-semibold hover:underline">
                      {r.nomor ?? '— draft —'}
                    </Link>
                    <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)} · {r.cabang.kode}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${TIPE_BADGE[r.tipe]}`}>
                      {r.tipe}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-tanah-500">
                    {r.akunKasBank.kode} {r.akunKasBank.nama}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-tanah-700 text-sm">{r.kontak ?? '—'}</div>
                    <div className="text-xs text-tanah-500">{r.deskripsi}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtRp(r.total)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      r.status === 'POSTED' ? 'bg-padi-100 text-padi-700' :
                      r.status === 'DRAFT' ? 'bg-emas-100 text-emas-700' : 'bg-cream-200 text-tanah-500'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-tanah-500">Belum ada transaksi.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
