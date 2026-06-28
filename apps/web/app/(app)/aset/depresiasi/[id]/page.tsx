import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canCancelPosted } from '@/lib/roles';
import { fmtRp, fmtTanggal } from '@/lib/format';

type Status = 'DRAFT' | 'POSTED' | 'CANCELLED' | 'PARTIAL' | 'PAID';

interface Detail {
  id: string;
  periode: string;
  tanggal: string;
  status: Status;
  totalPenyusutan: string;
  journalId: string | null;
  fiscalPeriod: { label: string };
  lines: Array<{
    nilai: string;
    nilaiBukuSebelum: string;
    nilaiBukuSesudah: string;
    akumulasiSesudah: string;
    aset: {
      id: string; kode: string; nama: string; kelompok: string; metode: string;
      cabang: { kode: string };
      akunBeban: { kode: string; nama: string };
      akunAkumulasi: { kode: string; nama: string };
    };
  }>;
}

async function cancelAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/depresiasi/runs/${id}/cancel`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan: String(formData.get('alasan') ?? '') }),
  });
  revalidatePath(`/aset/depresiasi/${id}`);
}

export default async function DepresiasiDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const run = await apiFetch<Detail>(`/depresiasi/runs/${id}`, { tenantId });
  const mayCancel = canCancelPosted(s.role);

  return (
    <>
      <Topbar breadcrumb={`Depresiasi / ${run.periode}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Penyusutan {run.periode}
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Tanggal posting {fmtTanggal(run.tanggal)} · {run.fiscalPeriod.label} ·
              {run.lines.length} aset
            </p>
            {run.journalId && (
              <p className="text-xs text-tanah-500 mt-1">
                Jurnal:{' '}
                <Link href={`/pembukuan/jurnal/${run.journalId}`}
                  className="text-sogan-500 font-mono hover:underline">lihat</Link>
              </p>
            )}
          </div>
          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${
            run.status === 'POSTED' ? 'bg-padi-100 text-padi-700' :
            run.status === 'CANCELLED' ? 'bg-cream-200 text-tanah-500 line-through' :
            'bg-emas-100 text-emas-700'
          }`}>{run.status}</span>
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2 font-bold">Aset</th>
                <th className="px-3 py-2 font-bold">Kelompok / Metode</th>
                <th className="px-3 py-2 font-bold">Akun Beban</th>
                <th className="px-3 py-2 font-bold">Akun Akumulasi</th>
                <th className="px-3 py-2 font-bold text-right">Nilai Buku Sebelum</th>
                <th className="px-3 py-2 font-bold text-right">Penyusutan</th>
                <th className="px-3 py-2 font-bold text-right">Akumulasi Sesudah</th>
                <th className="px-3 py-2 font-bold text-right">Nilai Buku Sesudah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {run.lines.map((l, i) => (
                <tr key={i} className="hover:bg-cream-50">
                  <td className="px-3 py-1.5">
                    <Link href={`/aset/${l.aset.id}`} className="font-mono text-sogan-500 hover:underline">{l.aset.kode}</Link>
                    <div className="text-xs text-tanah-700">{l.aset.nama}</div>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-tanah-500">
                    {l.aset.kelompok.replace(/_/g, ' ')} · {l.aset.metode === 'GARIS_LURUS' ? 'GL' : 'SM'}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-tanah-500">{l.aset.akunBeban.kode}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-tanah-500">{l.aset.akunAkumulasi.kode}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(l.nilaiBukuSebelum)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-bata-700">−{fmtRp(l.nilai)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(l.akumulasiSesudah)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold">{fmtRp(l.nilaiBukuSesudah)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-cream-50 font-bold">
              <tr><td colSpan={5} className="px-3 py-2 text-right">TOTAL</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-base">{fmtRp(run.totalPenyusutan)}</td>
                <td colSpan={2} /></tr>
            </tfoot>
          </table>
        </div>

        {run.status === 'POSTED' && mayCancel && (
          <form action={cancelAction} className="bg-white rounded-xl border border-cream-200 shadow-sm p-5 flex items-center gap-3">
            <input type="hidden" name="id" value={run.id} />
            <span className="text-sm text-tanah-500">Cancel run akan reverse jurnal & rollback nilai buku semua aset.</span>
            <input name="alasan" required minLength={5} placeholder="Alasan…"
              className="ml-auto px-3 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm w-72" />
            <button className="px-4 py-2 bg-bata-500 hover:bg-bata-700 text-cream-50 font-semibold rounded-lg text-sm">
              Cancel Run
            </button>
          </form>
        )}
      </div>
    </>
  );
}
