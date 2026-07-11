import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtNpwp, fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Badge, buttonClass, filterBarClass,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow, type BadgeVariant,
} from '@/components/ui';

type Jenis = 'PPH_21' | 'PPH_22' | 'PPH_23' | 'PPH_25' | 'PPH_26' | 'PPH_29' | 'PPH_4_AYAT_2' | 'PPH_15';
type Status = 'DRAFT' | 'TERBIT' | 'DIKIRIM_DJP' | 'DIBATALKAN';

interface Bupot {
  id: string;
  nomor: string | null;
  tanggal: string;
  jenisPph: Jenis;
  status: Status;
  pihakNama: string;
  pihakNpwp: string | null;
  dpp: string;
  tarifPersen: string;
  pph: string;
  sumberType: string | null;
  cabang: { kode: string };
}

const JENIS_BADGE: Record<Jenis, BadgeVariant> = {
  PPH_21: 'brand',
  PPH_22: 'warning',
  PPH_23: 'success',
  PPH_25: 'neutral',
  PPH_26: 'danger',
  PPH_29: 'neutral',
  PPH_4_AYAT_2: 'warning',
  PPH_15: 'neutral',
};

const STATUS_BADGE: Record<Status, BadgeVariant> = {
  TERBIT: 'success',
  DIKIRIM_DJP: 'brand',
  DRAFT: 'warning',
  DIBATALKAN: 'neutral',
};

export default async function BuktiPotongPage({
  searchParams,
}: {
  searchParams: Promise<{ jenisPph?: Jenis }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;
  const qs = sp.jenisPph ? `?jenisPph=${sp.jenisPph}` : '';
  const rows = await apiFetch<Bupot[]>(`/bukti-potong${qs}`, { tenantId });

  const totalPph = rows
    .filter((r) => r.status !== 'DIBATALKAN')
    .reduce((a, r) => a + Number(r.pph), 0);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Bukti Potong (e-Bupot Unifikasi)"
          subtitle={
            <>
              {rows.length} bukti · total PPh dipotong:{' '}
              <span className="font-semibold text-tanah-700">{fmtRp(totalPph)}</span>
              <span className="text-xs ml-2">·  Auto-generate dari Payroll (PPh 21) & Faktur Pembelian (PPh 23)</span>
            </>
          }
          actions={
            <a href={`/proxy/bukti-potong/export.xlsx${qs}`} className={buttonClass('success')}>Export Excel</a>
          }
        />

        <form className={filterBarClass}>
          {(['', 'PPH_21', 'PPH_23', 'PPH_4_AYAT_2'] as const).map((j) => (
            <Link key={j || 'all'}
              href={j ? `/pajak/bukti-potong?jenisPph=${j}` : '/pajak/bukti-potong'}
              className={`px-3 py-1.5 rounded-md font-semibold ${
                (sp.jenisPph ?? '') === j ? 'bg-sogan-500 text-cream-50' : 'text-tanah-500 hover:bg-cream-50'
              }`}>
              {j ? j.replace('_', ' ') : 'Semua'}
            </Link>
          ))}
        </form>

        <Table>
          <THead>
            <TH>No / Tgl</TH>
            <TH>Jenis</TH>
            <TH>Pihak Dipotong</TH>
            <TH>NPWP</TH>
            <TH numeric>DPP</TH>
            <TH numeric>Tarif</TH>
            <TH numeric>PPh</TH>
            <TH>Sumber</TH>
            <TH className="text-center">Status</TH>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id} className={r.status === 'DIBATALKAN' ? 'opacity-50 line-through' : undefined}>
                <TD className="font-mono text-xs text-sogan-500">{r.nomor ?? '—'}
                  <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)}</div>
                </TD>
                <TD>
                  <Badge variant={JENIS_BADGE[r.jenisPph]}>{r.jenisPph.replace('_', ' ')}</Badge>
                </TD>
                <TD className="text-tanah-700">{r.pihakNama}</TD>
                <TD className="font-mono text-xs text-tanah-500">{r.pihakNpwp ? fmtNpwp(r.pihakNpwp) : '—'}</TD>
                <MoneyCell>{fmtRp(r.dpp)}</MoneyCell>
                <TD className="text-right font-mono text-xs text-tanah-500">{r.tarifPersen}%</TD>
                <MoneyCell className="font-semibold text-bata-700">{fmtRp(r.pph)}</MoneyCell>
                <TD className="text-xs text-tanah-500">{r.sumberType?.replace(/_/g, ' ') ?? '—'}</TD>
                <TD className="text-center">
                  <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                </TD>
              </TR>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={9}>Belum ada bukti potong.</EmptyRow>}
          </TBody>
        </Table>
      </PageContainer>
    </>
  );
}
