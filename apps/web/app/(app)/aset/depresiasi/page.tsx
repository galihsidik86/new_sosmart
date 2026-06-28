import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

type Status = 'DRAFT' | 'POSTED' | 'CANCELLED' | 'PARTIAL' | 'PAID';

interface Run {
  id: string;
  periode: string;
  tanggal: string;
  status: Status;
  totalPenyusutan: string;
  journalId: string | null;
  _count: { lines: number };
}

interface PreviewRow {
  asetId: string;
  kode: string;
  nama: string;
  cabangKode: string;
  kelompok: string;
  metode: string;
  nilaiBukuSebelum: string;
  nilai: string;
  akumulasiSesudah: string;
  nilaiBukuSesudah: string;
}

async function runAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  await apiFetch('/depresiasi/run', {
    method: 'POST', tenantId,
    body: JSON.stringify({
      periode: String(formData.get('periode')),
      tanggal: (formData.get('tanggal') as string) || undefined,
    }),
  });
  revalidatePath('/aset/depresiasi');
}

function defaultNextPeriode(runs: Run[]): string {
  const last = runs[0];
  if (!last) return '2026-05';
  const [y, m] = last.periode.split('-').map(Number);
  const nextM = m! + 1;
  if (nextM > 12) return `${y! + 1}-01`;
  return `${y}-${String(nextM).padStart(2, '0')}`;
}

export default async function DepresiasiPage({
  searchParams,
}: { searchParams: Promise<{ preview?: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const runs = await apiFetch<Run[]>('/depresiasi/runs', { tenantId });
  const defaultPeriode = defaultNextPeriode(runs);
  const previewPeriode = sp.preview ?? defaultPeriode;

  let preview: PreviewRow[] = [];
  try {
    preview = await apiFetch<PreviewRow[]>(`/depresiasi/preview?periode=${previewPeriode}`, { tenantId });
  } catch {
    preview = [];
  }
  const totalPreview = preview.reduce((a, r) => a + Number(r.nilai), 0);

  return (
    <>
      <Topbar breadcrumb="Penyusutan Aset" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Penyusutan Aset Bulanan
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Hitung & posting otomatis per bulan. 1 run per tenant per periode. Cancel hanya boleh untuk periode terakhir.
            </p>
          </div>
          <a href="/proxy/depresiasi/runs/export.xlsx"
            className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
            Export Excel
          </a>
        </div>

        <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 flex items-center justify-between">
            <div className="font-display text-xl font-semibold text-wedel-900">
              Preview Periode {previewPeriode}
            </div>
            <form className="flex items-center gap-2">
              <input name="preview" defaultValue={previewPeriode} pattern="\d{4}-\d{2}" placeholder="YYYY-MM"
                className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono w-28" />
              <button className="px-3 py-1.5 bg-cream-200 border border-cream-400 rounded-md text-xs font-semibold text-tanah-700">
                Lihat
              </button>
            </form>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                <th className="px-4 py-2 font-bold">Aset</th>
                <th className="px-4 py-2 font-bold">Kelompok / Metode</th>
                <th className="px-4 py-2 font-bold">Cab.</th>
                <th className="px-4 py-2 font-bold text-right">Nilai Buku</th>
                <th className="px-4 py-2 font-bold text-right">Penyusutan</th>
                <th className="px-4 py-2 font-bold text-right">Sesudah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {preview.map((r) => (
                <tr key={r.asetId}>
                  <td className="px-4 py-1.5">
                    <Link href={`/aset/${r.asetId}`} className="font-mono text-sogan-500 hover:underline">{r.kode}</Link>
                    <span className="text-tanah-700 ml-2">{r.nama}</span>
                  </td>
                  <td className="px-4 py-1.5 text-xs text-tanah-500">
                    {r.kelompok.replace(/_/g, ' ')} · {r.metode === 'GARIS_LURUS' ? 'Garis Lurus' : 'Saldo Menurun'}
                  </td>
                  <td className="px-4 py-1.5 font-mono text-xs text-tanah-500">{r.cabangKode}</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums">{fmtRp(r.nilaiBukuSebelum)}</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums text-bata-700">−{fmtRp(r.nilai)}</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums font-semibold">{fmtRp(r.nilaiBukuSesudah)}</td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-tanah-500">
                  Tidak ada aset yang perlu disusutkan untuk {previewPeriode}.
                </td></tr>
              )}
            </tbody>
            <tfoot className="bg-cream-50 font-bold text-tanah-700">
              <tr><td colSpan={4} className="px-4 py-2 text-right">TOTAL PENYUSUTAN</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(totalPreview)}</td>
                <td /></tr>
            </tfoot>
          </table>
          {preview.length > 0 && (
            <div className="px-5 py-3 bg-white border-t border-cream-200 flex items-center justify-between">
              <p className="text-xs text-tanah-500">
                Klik "Jalankan & Post" untuk menulis kartu aset, terbitkan jurnal otomatis, dan tutup periode penyusutan {previewPeriode}.
              </p>
              <form action={runAction} className="flex items-center gap-2">
                <input type="hidden" name="periode" value={previewPeriode} />
                <input type="date" name="tanggal"
                  className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm" />
                <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                  Jalankan & Post {previewPeriode}
                </button>
              </form>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 font-display text-xl font-semibold text-wedel-900">
            Riwayat Run
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                <th className="px-4 py-2 font-bold">Periode</th>
                <th className="px-4 py-2 font-bold">Tanggal Posting</th>
                <th className="px-4 py-2 font-bold text-right">Jumlah Aset</th>
                <th className="px-4 py-2 font-bold text-right">Total Penyusutan</th>
                <th className="px-4 py-2 font-bold">Jurnal</th>
                <th className="px-4 py-2 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-cream-50">
                  <td className="px-4 py-2 font-mono">
                    <Link href={`/aset/depresiasi/${r.id}`} className="text-sogan-500 font-semibold hover:underline">
                      {r.periode}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-tanah-500">{fmtTanggal(r.tanggal)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{r._count.lines}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtRp(r.totalPenyusutan)}</td>
                  <td className="px-4 py-2">
                    {r.journalId && (
                      <Link href={`/pembukuan/jurnal/${r.journalId}`} className="text-xs text-sogan-500 font-mono hover:underline">
                        lihat
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      r.status === 'POSTED' ? 'bg-padi-100 text-padi-700' :
                      r.status === 'DRAFT' ? 'bg-emas-100 text-emas-700' :
                      'bg-cream-200 text-tanah-500'
                    }`}>{r.status}</span>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-tanah-500">Belum ada run depresiasi.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
