import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain, fmtRp, fmtTanggal, fmtNpwp } from '@/lib/format';

type Status = 'DRAFT' | 'POSTED' | 'PARTIAL' | 'PAID' | 'CANCELLED';

interface Detail {
  id: string;
  nomor: string | null;
  tanggal: string;
  jatuhTempo: string;
  termin: 'TUNAI' | 'KREDIT';
  status: Status;
  deskripsi: string | null;
  customer: { kode: string; nama: string; npwp: string | null; isPkp: boolean; alamat: string | null };
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  akunAr: { kode: string; nama: string };
  totalDpp: string; totalPpn: string; totalDiskon: string; totalNetto: string; totalDibayar: string;
  journalId: string | null;
  postedAt: string | null;
  lines: Array<{
    no: number; deskripsi: string; qty: string; satuan: string;
    hargaSatuan: string; diskonPersen: string; klasifikasiPpn: string; isJasa: boolean;
    bruto: string; diskonNilai: string; dpp: string; ppn: string;
    item: { kode: string; nama: string } | null;
    akunPendapatan: { kode: string; nama: string };
  }>;
}

async function postAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/sales-invoices/${id}/post`, { method: 'POST', tenantId });
  revalidatePath(`/transaksi/penjualan/${id}`);
}
async function cancelAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/sales-invoices/${id}/cancel`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan: String(formData.get('alasan') ?? '') }),
  });
  revalidatePath(`/transaksi/penjualan/${id}`);
}
async function deleteAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/sales-invoices/${id}`, { method: 'DELETE', tenantId });
  redirect('/transaksi/penjualan');
}

export default async function PenjualanDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const inv = await apiFetch<Detail>(`/sales-invoices/${id}`, { tenantId });
  const sisa = Number(inv.totalNetto) - Number(inv.totalDibayar);

  return (
    <>
      <Topbar breadcrumb={`Penjualan / ${inv.nomor ?? 'Draft'}`} tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              {inv.nomor ?? '— Draft —'}
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {fmtTanggal(inv.tanggal)} · jatuh tempo {fmtTanggal(inv.jatuhTempo)} ·
              cabang {inv.cabang.kode} · termin {inv.termin}
            </p>
            {inv.journalId && (
              <p className="text-xs text-tanah-500 mt-1">
                Jurnal terkait:{' '}
                <Link href={`/pembukuan/jurnal/${inv.journalId}`}
                  className="text-sogan-500 font-mono hover:underline">
                  lihat jurnal
                </Link>
              </p>
            )}
          </div>
          <StatusBadge status={inv.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-cream-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Pelanggan</div>
            <div className="font-semibold text-tanah-700 mt-1">{inv.customer.nama}</div>
            <div className="text-xs text-tanah-500 font-mono">{inv.customer.kode}</div>
            <div className="text-xs text-tanah-500 mt-1">
              NPWP {fmtNpwp(inv.customer.npwp)} {inv.customer.isPkp && <span className="text-padi-700 font-semibold ml-1">PKP</span>}
            </div>
          </div>
          <div className="bg-white border border-cream-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">Akun AR</div>
            <div className="font-semibold text-tanah-700 font-mono mt-1">{inv.akunAr.kode}</div>
            <div className="text-xs text-tanah-500">{inv.akunAr.nama}</div>
            <div className="text-xs text-tanah-500 mt-2">Periode: {inv.fiscalPeriod.label}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2 font-bold w-8">#</th>
                <th className="px-3 py-2 font-bold">Deskripsi</th>
                <th className="px-3 py-2 font-bold text-right">Qty</th>
                <th className="px-3 py-2 font-bold text-right">Harga</th>
                <th className="px-3 py-2 font-bold text-right">Disk</th>
                <th className="px-3 py-2 font-bold">PPN</th>
                <th className="px-3 py-2 font-bold text-right">DPP</th>
                <th className="px-3 py-2 font-bold text-right">PPN Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {inv.lines.map((l) => (
                <tr key={l.no}>
                  <td className="px-3 py-1.5 text-xs text-tanah-500">{l.no}</td>
                  <td className="px-3 py-1.5">
                    <div className="text-tanah-700">{l.deskripsi}</div>
                    <div className="text-xs text-tanah-500 font-mono">
                      {l.item ? `${l.item.kode}` : 'manual'} · {l.akunPendapatan.kode}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs">
                    {Number(l.qty).toLocaleString('id-ID')} {l.satuan}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtPlain(l.hargaSatuan)}</td>
                  <td className="px-3 py-1.5 text-right text-xs text-tanah-500">{l.diskonPersen}%</td>
                  <td className="px-3 py-1.5 text-xs text-tanah-500">{l.klasifikasiPpn}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtPlain(l.dpp)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{Number(l.ppn) > 0 ? fmtPlain(l.ppn) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-cream-50 font-bold text-tanah-700">
              <tr><td colSpan={6} className="px-3 py-1.5 text-right">Total DPP</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums" colSpan={2}>{fmtRp(inv.totalDpp)}</td></tr>
              <tr><td colSpan={6} className="px-3 py-1.5 text-right">Total PPN</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums" colSpan={2}>{fmtRp(inv.totalPpn)}</td></tr>
              <tr className="border-t-2 border-cream-300">
                <td colSpan={6} className="px-3 py-2 text-right text-base">TOTAL FAKTUR</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-base" colSpan={2}>{fmtRp(inv.totalNetto)}</td>
              </tr>
              {Number(inv.totalDibayar) > 0 && (
                <tr><td colSpan={6} className="px-3 py-1.5 text-right text-padi-700">Telah dibayar</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-padi-700" colSpan={2}>{fmtRp(inv.totalDibayar)}</td></tr>
              )}
              {sisa > 0 && inv.status !== 'CANCELLED' && (
                <tr><td colSpan={6} className="px-3 py-1.5 text-right text-bata-700">Sisa</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-bata-700" colSpan={2}>{fmtRp(sisa)}</td></tr>
              )}
            </tfoot>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`/proxy/sales-invoices/${inv.id}/print.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-bata-100 hover:bg-bata-200 text-bata-700 font-semibold rounded-lg text-sm border border-bata-300"
          >
            Preview PDF
          </a>
          {inv.status === 'DRAFT' && (
            <>
              <form action={postAction}>
                <input type="hidden" name="id" value={inv.id} />
                <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                  Post Faktur (terbitkan jurnal)
                </button>
              </form>
              <Link
                href={`/transaksi/penjualan/${inv.id}/edit` as Route}
                className="px-4 py-2 bg-white hover:bg-cream-50 text-tanah-700 font-semibold rounded-lg text-sm border border-cream-300"
              >
                Edit Draft
              </Link>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={inv.id} />
                <button className="px-4 py-2 bg-cream-200 hover:bg-cream-300 text-tanah-700 font-semibold rounded-lg text-sm border border-cream-400">
                  Hapus Draft
                </button>
              </form>
            </>
          )}
          {(inv.status === 'POSTED' || inv.status === 'PARTIAL') && (
            <form action={cancelAction} className="flex gap-2">
              <input type="hidden" name="id" value={inv.id} />
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

function StatusBadge({ status }: { status: Status }) {
  const m = {
    DRAFT: 'bg-emas-100 text-emas-700',
    POSTED: 'bg-padi-100 text-padi-700',
    PARTIAL: 'bg-sogan-50 text-sogan-500',
    PAID: 'bg-padi-300 text-padi-700',
    CANCELLED: 'bg-cream-200 text-tanah-500 line-through',
  }[status];
  return (
    <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${m}`}>
      {status}
    </span>
  );
}
