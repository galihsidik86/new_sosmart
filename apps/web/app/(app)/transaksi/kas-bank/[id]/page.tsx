import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain, fmtRp, fmtTanggal } from '@/lib/format';

interface Detail {
  id: string;
  nomor: string | null;
  tanggal: string;
  tipe: 'RECEIPT' | 'PAYMENT' | 'TRANSFER';
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  akunKasBank: { kode: string; nama: string };
  cabang: { kode: string; nama: string };
  total: string;
  kontak: string | null;
  deskripsi: string | null;
  salesInvoiceId: string | null;
  purchaseInvoiceId: string | null;
  journalId: string | null;
  lines: Array<{
    no: number; nilai: string; deskripsi: string | null;
    account: { kode: string; nama: string };
  }>;
}

async function postAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/cash-bank/${id}/post`, { method: 'POST', tenantId });
  revalidatePath(`/transaksi/kas-bank/${id}`);
}
async function cancelAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/cash-bank/${id}/cancel`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan: String(formData.get('alasan') ?? '') }),
  });
  revalidatePath(`/transaksi/kas-bank/${id}`);
}

export default async function KasBankDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const e = await apiFetch<Detail>(`/cash-bank/${id}`, { tenantId });

  return (
    <>
      <Topbar breadcrumb={`Kas/Bank / ${e.nomor ?? 'Draft'}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-4xl mx-auto w-full">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              {e.nomor ?? '— Draft —'}
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {fmtTanggal(e.tanggal)} · {e.tipe} · {e.akunKasBank.kode} {e.akunKasBank.nama}
            </p>
            {e.journalId && (
              <p className="text-xs text-tanah-500 mt-1">
                Jurnal:{' '}
                <Link href={`/pembukuan/jurnal/${e.journalId}`}
                  className="text-sogan-500 font-mono hover:underline">lihat</Link>
              </p>
            )}
            {(e.salesInvoiceId || e.purchaseInvoiceId) && (
              <p className="text-xs text-tanah-500 mt-1">
                Pelunasan untuk:{' '}
                <Link
                  href={e.salesInvoiceId ? `/transaksi/penjualan/${e.salesInvoiceId}` : `/transaksi/pembelian/${e.purchaseInvoiceId}`}
                  className="text-sogan-500 hover:underline"
                >
                  faktur terkait
                </Link>
              </p>
            )}
          </div>
          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${
            e.status === 'POSTED' ? 'bg-padi-100 text-padi-700' :
            e.status === 'DRAFT' ? 'bg-emas-100 text-emas-700' :
            'bg-cream-200 text-tanah-500'
          }`}>{e.status}</span>
        </div>

        <div className="bg-white border border-cream-200 rounded-xl p-5 shadow-sm mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Kontak</div>
              <div className="text-tanah-700">{e.kontak ?? '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Cabang</div>
              <div className="text-tanah-700">{e.cabang.kode} — {e.cabang.nama}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Keterangan</div>
              <div className="text-tanah-700">{e.deskripsi ?? '—'}</div>
            </div>
            <div className="col-span-2 pt-3 border-t border-cream-200">
              <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Total</div>
              <div className="font-display text-3xl font-semibold text-wedel-900 mt-1 tabular-nums">
                {fmtRp(e.total)}
              </div>
            </div>
          </div>
        </div>

        {e.lines.length > 0 && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-3 py-2 font-bold w-8">#</th>
                  <th className="px-3 py-2 font-bold">Akun</th>
                  <th className="px-3 py-2 font-bold">Keterangan</th>
                  <th className="px-3 py-2 font-bold text-right">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {e.lines.map((l) => (
                  <tr key={l.no}>
                    <td className="px-3 py-1.5 text-xs text-tanah-500">{l.no}</td>
                    <td className="px-3 py-1.5 font-mono">
                      <span className="text-tanah-700">{l.account.kode}</span>{' '}
                      <span className="text-tanah-500">{l.account.nama}</span>
                    </td>
                    <td className="px-3 py-1.5 text-tanah-500 text-xs">{l.deskripsi ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtPlain(l.nilai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-3">
          {e.status === 'DRAFT' && (
            <form action={postAction}>
              <input type="hidden" name="id" value={e.id} />
              <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                Post Bukti
              </button>
            </form>
          )}
          {e.status === 'POSTED' && (
            <form action={cancelAction} className="flex gap-2">
              <input type="hidden" name="id" value={e.id} />
              <input name="alasan" required minLength={5} placeholder="Alasan pembatalan…"
                className="px-3 py-2 bg-white border border-cream-300 rounded-md text-sm w-72" />
              <button className="px-4 py-2 bg-bata-500 hover:bg-bata-700 text-cream-50 font-semibold rounded-lg text-sm">
                Batalkan
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
