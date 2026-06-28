import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

type Status = 'AKTIF' | 'DIJUAL' | 'RUSAK' | 'PENSIUN';
type Kelompok =
  | 'BANGUNAN_PERMANEN' | 'BANGUNAN_NON_PERMANEN'
  | 'KELOMPOK_I' | 'KELOMPOK_II' | 'KELOMPOK_III' | 'KELOMPOK_IV';
type Metode = 'GARIS_LURUS' | 'SALDO_MENURUN';

interface Row {
  id: string;
  kode: string;
  nama: string;
  kelompok: Kelompok;
  metode: Metode;
  tanggalPerolehan: string;
  hargaPerolehan: string;
  akumulasiPenyusutan: string;
  nilaiBuku: string;
  masaManfaatBulan: number;
  status: Status;
  lastDepresiasiPeriode: string | null;
  cabang: { kode: string };
}

const KELOMPOK_LABEL: Record<Kelompok, string> = {
  BANGUNAN_PERMANEN: 'Bangunan Permanen (20 thn)',
  BANGUNAN_NON_PERMANEN: 'Bangunan Non-Permanen (10 thn)',
  KELOMPOK_I: 'Kelompok I (4 thn)',
  KELOMPOK_II: 'Kelompok II (8 thn)',
  KELOMPOK_III: 'Kelompok III (16 thn)',
  KELOMPOK_IV: 'Kelompok IV (20 thn)',
};

const STATUS_BADGE: Record<Status, string> = {
  AKTIF: 'bg-padi-100 text-padi-700',
  DIJUAL: 'bg-cream-200 text-tanah-500',
  RUSAK: 'bg-bata-100 text-bata-700',
  PENSIUN: 'bg-cream-200 text-tanah-500',
};

export default async function AsetDaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Status }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const qs = sp.status ? `?status=${sp.status}` : '';
  const rows = await apiFetch<Row[]>(`/aset${qs}`, { tenantId });

  const totalNilai = rows
    .filter((r) => r.status === 'AKTIF')
    .reduce((a, r) => a + Number(r.nilaiBuku), 0);

  return (
    <>
      <Topbar breadcrumb="Aset Tetap" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Aset Tetap
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {rows.length} aset · total nilai buku AKTIF:{' '}
              <span className="font-semibold text-tanah-700">{fmtRp(totalNilai)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/proxy/aset/export.xlsx"
              className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
              Export Excel
            </a>
            <Link href="/aset/baru"
              className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
              + Aset Baru
            </Link>
          </div>
        </div>

        <form className="bg-white border border-cream-200 rounded-xl p-3 mb-6 flex items-center gap-2 shadow-sm text-sm">
          {(['', 'AKTIF', 'DIJUAL', 'RUSAK', 'PENSIUN'] as const).map((st) => (
            <Link key={st || 'all'}
              href={st ? `/aset/daftar?status=${st}` : '/aset/daftar'}
              className={`px-3 py-1.5 rounded-md font-semibold ${
                (sp.status ?? '') === st ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'
              }`}>
              {st || 'Semua'}
            </Link>
          ))}
        </form>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-4 py-3 font-bold">Kode</th>
                <th className="px-4 py-3 font-bold">Nama / Kelompok</th>
                <th className="px-4 py-3 font-bold">Perolehan</th>
                <th className="px-4 py-3 font-bold text-right">Harga Perolehan</th>
                <th className="px-4 py-3 font-bold text-right">Akumulasi</th>
                <th className="px-4 py-3 font-bold text-right">Nilai Buku</th>
                <th className="px-4 py-3 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-cream-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/aset/${r.id}`} className="font-mono text-sogan-500 font-semibold hover:underline">
                      {r.kode}
                    </Link>
                    <div className="text-xs text-tanah-500">{r.cabang.kode}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-tanah-700">{r.nama}</div>
                    <div className="text-xs text-tanah-500">
                      {KELOMPOK_LABEL[r.kelompok]} · {r.metode === 'GARIS_LURUS' ? 'Garis Lurus' : 'Saldo Menurun'}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-tanah-500">{fmtTanggal(r.tanggalPerolehan)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtRp(r.hargaPerolehan)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-bata-700">{fmtRp(r.akumulasiPenyusutan)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">{fmtRp(r.nilaiBuku)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_BADGE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-tanah-500">Belum ada aset.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
