import Link from 'next/link';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, StatusBadge, Badge, buttonClass, filterBarClass, type BadgeVariant } from '@/components/ui';

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
  linkBukti: string | null;
  total: string;
  akunKasBank: { kode: string; nama: string };
  cabang: { kode: string };
}

const TIPE_BADGE: Record<Tipe, BadgeVariant> = {
  RECEIPT: 'success',
  PAYMENT: 'danger',
  TRANSFER: 'neutral',
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
      <PageContainer size="list">
        <PageHeader
          title="Bukti Kas & Bank"
          subtitle="BKM/BKK untuk kas keluar-masuk · BMT untuk mutasi antar akun · pelunasan AR/AP otomatis update status faktur."
          actions={
            <>
              <a href={`/proxy/cash-bank/export.xlsx${sp.tipe ? '?tipe=' + sp.tipe : ''}`}
                className={buttonClass('success')}>
                Export Excel
              </a>
              <Link href="/transaksi/kas-bank/baru" className={buttonClass('primary')}>
                + Bukti Baru
              </Link>
            </>
          }
        />

        <form className={filterBarClass}>
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
                <th className="px-4 py-3 font-bold text-center">Bukti</th>
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
                    <Badge variant={TIPE_BADGE[r.tipe]}>{r.tipe}</Badge>
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
                    <LinkBukti url={r.linkBukti} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-tanah-500">Belum ada transaksi.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageContainer>
    </>
  );
}
