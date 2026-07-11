import Link from 'next/link';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow,
  StatusBadge, Button, buttonClass, FilterLabel, Select, filterBarClass,
} from '@/components/ui';

type Status = 'DRAFT' | 'POSTED' | 'REVERSED';
type Sumber =
  | 'MANUAL' | 'PENJUALAN' | 'RETUR_JUAL' | 'PEMBELIAN' | 'RETUR_BELI'
  | 'KAS_BANK' | 'PENYUSUTAN' | 'PENYESUAIAN' | 'TUTUP_BUKU' | 'PAJAK';

interface JurnalRow {
  id: string;
  nomor: string | null;
  tanggal: string;
  deskripsi: string;
  linkBukti: string | null;
  status: Status;
  sumber: Sumber;
  totalDebit: string;
  totalKredit: string;
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  _count: { lines: number };
}
interface PeriodYear {
  id: string;
  kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}

export default async function JurnalPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; status?: Status }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const currentPeriod =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id;

  const qs = new URLSearchParams();
  if (currentPeriod) qs.set('periodId', currentPeriod);
  if (sp.status) qs.set('status', sp.status);
  const jurnals = await apiFetch<JurnalRow[]>(
    `/journals${qs.toString() ? '?' + qs : ''}`,
    { tenantId },
  );

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Jurnal Umum"
          subtitle={`${jurnals.length} jurnal · invariant debit = kredit dipaksakan di DB.`}
          actions={
            <>
              <a
                href={`/proxy/journals/export.xlsx${qs.toString() ? '?' + qs : ''}`}
                className={buttonClass('success')}
              >
                Export Excel
              </a>
              <Link href="/pembukuan/jurnal/baru" className={buttonClass('primary')}>
                + Jurnal Baru
              </Link>
            </>
          }
        />

        <form className={filterBarClass}>
          <FilterLabel>Periode</FilterLabel>
          <Select name="periodId" defaultValue={currentPeriod} fullWidth={false}>
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.status})
              </option>
            ))}
          </Select>
          <FilterLabel>Status</FilterLabel>
          <Select name="status" defaultValue={sp.status ?? ''} fullWidth={false}>
            <option value="">Semua</option>
            <option value="DRAFT">DRAFT</option>
            <option value="POSTED">POSTED</option>
            <option value="REVERSED">REVERSED</option>
          </Select>
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Terapkan</Button>
        </form>

        <Table>
          <THead>
            <TH>No / Tgl</TH>
            <TH>Deskripsi</TH>
            <TH>Sumber</TH>
            <TH>Cabang</TH>
            <TH numeric>Total</TH>
            <TH className="text-center">Bukti</TH>
            <TH className="text-center">Status</TH>
          </THead>
          <TBody>
            {jurnals.map((j) => (
              <TR key={j.id}>
                <TD>
                  <Link
                    href={`/pembukuan/jurnal/${j.id}`}
                    className="font-mono text-sogan-500 font-semibold hover:underline"
                  >
                    {j.nomor ?? '— draft —'}
                  </Link>
                  <div className="text-xs text-tanah-500">
                    {fmtTanggal(j.tanggal)}
                  </div>
                </TD>
                <TD>
                  <div className="text-tanah-700">{j.deskripsi}</div>
                  <div className="text-xs text-tanah-500">
                    {j._count.lines} baris · {j.fiscalPeriod.label}
                  </div>
                </TD>
                <TD className="text-xs text-tanah-500">{j.sumber}</TD>
                <TD className="text-xs text-tanah-500 font-mono">{j.cabang.kode}</TD>
                <MoneyCell>{fmtRp(j.totalDebit)}</MoneyCell>
                <TD className="text-center">
                  <LinkBukti url={j.linkBukti} />
                </TD>
                <TD className="text-center">
                  <StatusBadge status={j.status} />
                </TD>
              </TR>
            ))}
            {jurnals.length === 0 && (
              <EmptyRow colSpan={7}>Belum ada jurnal di periode ini.</EmptyRow>
            )}
          </TBody>
        </Table>
      </PageContainer>
    </>
  );
}
