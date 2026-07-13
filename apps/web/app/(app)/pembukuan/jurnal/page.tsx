import Link from 'next/link';
import { LinkBukti } from '@/components/LinkBukti';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow,
  StatusBadge, Button, buttonClass, FilterLabel, Input, Select, filterBarClass,
} from '@/components/ui';
import { type FilterOption } from '@/components/ListFilters';
import { buildListHref } from '@/lib/list-query';

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
  searchParams: Promise<{
    periodId?: string;
    status?: Status;
    search?: string;
    cabangId?: string;
    projectId?: string;
    industriId?: string;
  }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const currentPeriod =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id;

  const apiParams = {
    periodId: currentPeriod,
    status: sp.status,
    search: sp.search,
    cabangId: sp.cabangId,
    projectId: sp.projectId,
    industriId: sp.industriId,
  };
  const [jurnals, cabang, projects, industri] = await Promise.all([
    apiFetch<JurnalRow[]>(buildListHref('/journals', apiParams), { tenantId }),
    apiFetch<FilterOption[]>('/cabang', { tenantId }).catch(() => [] as FilterOption[]),
    apiFetch<FilterOption[]>('/projects', { tenantId }).catch(() => [] as FilterOption[]),
    apiFetch<FilterOption[]>('/industri', { tenantId }).catch(() => [] as FilterOption[]),
  ]);
  const isPusat = ['OWNER', 'ADMIN', 'AKUNTAN'].includes(s.role ?? '');

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Jurnal Umum"
          subtitle={`${jurnals.length} jurnal · invariant debit = kredit dipaksakan di DB.`}
          actions={
            <>
              <a
                href={buildListHref('/proxy/journals/export.xlsx', apiParams)}
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
          <div className="flex-1 min-w-[170px]">
            <Input name="search" defaultValue={sp.search ?? ''} placeholder="Cari no. jurnal / deskripsi…" aria-label="Cari" />
          </div>
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
          {isPusat && cabang.length > 1 && (
            <>
              <FilterLabel>Cabang</FilterLabel>
              <Select name="cabangId" defaultValue={sp.cabangId ?? ''} fullWidth={false} className="min-w-[140px]">
                <option value="">Semua cabang</option>
                {cabang.map((c) => (
                  <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>
                ))}
              </Select>
            </>
          )}
          {projects.length > 0 && (
            <>
              <FilterLabel>Proyek</FilterLabel>
              <Select name="projectId" defaultValue={sp.projectId ?? ''} fullWidth={false} className="min-w-[150px]">
                <option value="">Semua proyek</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
                ))}
              </Select>
            </>
          )}
          {industri.length > 0 && (
            <>
              <FilterLabel>Industri</FilterLabel>
              <Select name="industriId" defaultValue={sp.industriId ?? ''} fullWidth={false} className="min-w-[150px]">
                <option value="">Semua industri</option>
                {industri.map((i) => (
                  <option key={i.id} value={i.id}>{i.nama}</option>
                ))}
              </Select>
            </>
          )}
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
