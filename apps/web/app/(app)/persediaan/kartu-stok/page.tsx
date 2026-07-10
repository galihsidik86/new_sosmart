import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain, fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, FilterLabel, Select, Button, buttonClass, filterBarClass,
} from '@/components/ui';

interface Item { id: string; kode: string; nama: string; satuan: string; isAktif: boolean }
interface Cabang { id: string; kode: string; nama: string }
interface MovementRow {
  id: string;
  tanggal: string;
  occurredAt: string;
  tipe: string;
  qtyIn: string;
  qtyOut: string;
  hargaPokok: string;
  nilai: string;
  saldoQty: string;
  saldoNilai: string;
  sumberType: string | null;
  sumberId: string | null;
  keterangan: string | null;
  cabang: { kode: string };
}
interface KartuResp {
  item: { id: string; kode: string; nama: string; satuan: string };
  rows: MovementRow[];
}

const TIPE_BADGE: Record<string, string> = {
  STOK_AWAL: 'bg-cream-300 text-tanah-700',
  PEMBELIAN: 'bg-padi-100 text-padi-700',
  RETUR_BELI: 'bg-bata-100 text-bata-700',
  PENJUALAN: 'bg-bata-100 text-bata-700',
  RETUR_JUAL: 'bg-padi-100 text-padi-700',
  OPNAME_PLUS: 'bg-emas-100 text-emas-700',
  OPNAME_MINUS: 'bg-emas-100 text-emas-700',
  TRANSFER_IN: 'bg-sogan-50 text-sogan-500',
  TRANSFER_OUT: 'bg-sogan-50 text-sogan-500',
};

export default async function KartuStokPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string; cabangId?: string; startDate?: string; endDate?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const [items, cabang] = await Promise.all([
    apiFetch<Item[]>('/items', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
  ]);
  const aktif = items.filter((i) => i.isAktif);
  const itemId = sp.itemId ?? aktif[0]?.id;

  let kartu: KartuResp | null = null;
  if (itemId) {
    const qs = new URLSearchParams({ itemId });
    if (sp.cabangId) qs.set('cabangId', sp.cabangId);
    if (sp.startDate) qs.set('startDate', sp.startDate);
    if (sp.endDate) qs.set('endDate', sp.endDate);
    kartu = await apiFetch<KartuResp>(`/inventory/kartu-stok?${qs}`, { tenantId });
  }

  return (
    <>
      <Topbar breadcrumb="Kartu Stok" tenantNama={s.tenantNama!} />
      <PageContainer size="list">
        <PageHeader
          title="Kartu Stok"
          subtitle="Mutasi stok dengan saldo berjalan per item per cabang. Sumber telusur balik ke faktur penjualan/pembelian/opname."
          actions={
            itemId ? (
              <a href={`/proxy/inventory/kartu-stok/export.xlsx?itemId=${itemId}${sp.cabangId ? '&cabangId=' + sp.cabangId : ''}${sp.startDate ? '&startDate=' + sp.startDate : ''}${sp.endDate ? '&endDate=' + sp.endDate : ''}`}
                className={buttonClass('success')}>
                Export Excel
              </a>
            ) : undefined
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>Item</FilterLabel>
          <Select name="itemId" defaultValue={itemId} fullWidth={false} className="font-mono">
            {aktif.map((i) => (
              <option key={i.id} value={i.id}>{i.kode}  {i.nama}</option>
            ))}
          </Select>
          <FilterLabel>Cabang</FilterLabel>
          <Select name="cabangId" defaultValue={sp.cabangId ?? ''} fullWidth={false}>
            <option value="">Semua</option>
            {cabang.map((c) => (
              <option key={c.id} value={c.id}>{c.kode}</option>
            ))}
          </Select>
          <FilterLabel>Dari</FilterLabel>
          <input type="date" name="startDate" defaultValue={sp.startDate}
            className="px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          <FilterLabel>Sampai</FilterLabel>
          <input type="date" name="endDate" defaultValue={sp.endDate}
            className="px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Tampilkan</Button>
        </form>

        {kartu && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200">
              <div className="font-display text-xl font-semibold text-wedel-900 font-mono">
                {kartu.item.kode}  {kartu.item.nama}
              </div>
              <div className="text-xs text-tanah-500 mt-1">{kartu.rows.length} mutasi</div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-white text-left">
                <tr className="text-[10px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                  <th className="px-3 py-2 font-bold">Tgl</th>
                  <th className="px-3 py-2 font-bold">Tipe</th>
                  <th className="px-3 py-2 font-bold">Cab.</th>
                  <th className="px-3 py-2 font-bold">Keterangan</th>
                  <th className="px-3 py-2 font-bold text-right">Qty Masuk</th>
                  <th className="px-3 py-2 font-bold text-right">Qty Keluar</th>
                  <th className="px-3 py-2 font-bold text-right">Harga Pokok</th>
                  <th className="px-3 py-2 font-bold text-right">Nilai Mvm</th>
                  <th className="px-3 py-2 font-bold text-right">Saldo Qty</th>
                  <th className="px-3 py-2 font-bold text-right">Saldo Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {kartu.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-cream-50">
                    <td className="px-3 py-1.5 text-tanah-500">{fmtTanggal(r.tanggal)}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${TIPE_BADGE[r.tipe] ?? 'bg-cream-200 text-tanah-500'}`}>
                        {r.tipe}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-tanah-500">{r.cabang.kode}</td>
                    <td className="px-3 py-1.5 text-tanah-700">{r.keterangan ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{Number(r.qtyIn) > 0 ? fmtPlain(Number(r.qtyIn)) : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-bata-700">{Number(r.qtyOut) > 0 ? fmtPlain(Number(r.qtyOut)) : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-tanah-500">{fmtRp(r.hargaPokok)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(r.nilai)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold">{fmtPlain(Number(r.saldoQty))}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold">{fmtRp(r.saldoNilai)}</td>
                  </tr>
                ))}
                {kartu.rows.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-tanah-500 text-sm">Tidak ada mutasi.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </PageContainer>
    </>
  );
}
