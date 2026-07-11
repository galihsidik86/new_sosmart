import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtPlain, fmtRp } from '@/lib/format';
import {
  PageContainer, PageHeader, FilterLabel, buttonClass, filterBarClass,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow,
} from '@/components/ui';

interface SaldoRow {
  item: { id: string; kode: string; nama: string; satuan: string; kategori: string | null };
  cabang: { id: string; kode: string; nama: string };
  qty: string;
  nilai: string;
  lastAt: string;
}
interface Cabang { id: string; kode: string; nama: string }

export default async function SaldoStokPage({
  searchParams,
}: {
  searchParams: Promise<{ cabangId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const cabang = await apiFetch<Cabang[]>('/cabang', { tenantId });
  const qs = sp.cabangId ? `?cabangId=${sp.cabangId}` : '';
  const rows = await apiFetch<SaldoRow[]>(`/inventory/saldo${qs}`, { tenantId });

  const totalNilai = rows.reduce((a, r) => a + Number(r.nilai), 0);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Saldo Stok"
          subtitle={
            <>
              Snapshot terkini per (item × cabang). Total nilai persediaan: <span className="font-semibold text-tanah-700">{fmtRp(totalNilai)}</span>
            </>
          }
          actions={
            <a href={`/proxy/inventory/saldo/export.xlsx${qs}`} className={buttonClass('success')}>
              Export Excel
            </a>
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>Cabang:</FilterLabel>
          <Link href="/persediaan/saldo"
            className={`px-3 py-1.5 rounded-md font-semibold ${!sp.cabangId ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'}`}>
            Semua
          </Link>
          {cabang.map((c) => (
            <Link key={c.id}
              href={`/persediaan/saldo?cabangId=${c.id}`}
              className={`px-3 py-1.5 rounded-md font-semibold ${sp.cabangId === c.id ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'}`}>
              {c.kode}
            </Link>
          ))}
        </form>

        <Table>
          <THead>
            <TH>Kode</TH>
            <TH>Nama</TH>
            <TH>Cabang</TH>
            <TH numeric>Qty</TH>
            <TH numeric>Nilai</TH>
            <TH numeric>Harga Pokok Rata</TH>
            <TH />
          </THead>
          <TBody>
            {rows.map((r, i) => {
              const qty = Number(r.qty);
              const nilai = Number(r.nilai);
              const rata = qty > 0 ? nilai / qty : 0;
              return (
                <TR key={i}>
                  <TD className="font-mono text-tanah-700">{r.item.kode}</TD>
                  <TD>
                    <div className="font-semibold text-tanah-700">{r.item.nama}</div>
                    <div className="text-xs text-tanah-500">{r.item.kategori ?? '—'} · {r.item.satuan}</div>
                  </TD>
                  <TD className="text-xs font-mono text-tanah-500">{r.cabang.kode}</TD>
                  <MoneyCell>
                    {fmtPlain(qty)} <span className="text-tanah-500 text-xs ml-1">{r.item.satuan}</span>
                  </MoneyCell>
                  <MoneyCell>{fmtRp(nilai)}</MoneyCell>
                  <MoneyCell className="text-tanah-500">{fmtRp(rata)}</MoneyCell>
                  <TD className="text-right">
                    <Link href={`/persediaan/kartu-stok?itemId=${r.item.id}&cabangId=${r.cabang.id}`}
                      className="text-xs text-sogan-500 font-semibold hover:underline">
                      Kartu stok →
                    </Link>
                  </TD>
                </TR>
              );
            })}
            {rows.length === 0 && <EmptyRow colSpan={7}>Belum ada movement stok.</EmptyRow>}
          </TBody>
        </Table>
      </PageContainer>
    </>
  );
}
