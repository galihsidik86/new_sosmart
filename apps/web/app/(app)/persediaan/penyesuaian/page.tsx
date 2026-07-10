import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, buttonClass, StatusBadge,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow,
} from '@/components/ui';

type Status = 'DRAFT' | 'POSTED' | 'CANCELLED' | 'PARTIAL' | 'PAID';

interface Row {
  id: string;
  nomor: string | null;
  tanggal: string;
  alasan: string;
  status: Status;
  totalDeltaNilai: string;
  cabang: { kode: string; nama: string };
  fiscalPeriod: { label: string };
  _count: { lines: number };
}

export default async function PenyesuaianListPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const rows = await apiFetch<Row[]>('/stok-adjustments', { tenantId });

  return (
    <>
      <Topbar breadcrumb="Penyesuaian Stok" tenantNama={s.tenantNama!} />
      <PageContainer size="list">
        <PageHeader
          title="Penyesuaian Stok (Opname)"
          subtitle="Selisih hasil opname fisik vs pencatatan. Auto-jurnal: delta+ → D Persediaan / K Pendapatan Penyesuaian, delta- → D Beban Penyesuaian / K Persediaan."
          actions={
            <>
              <a href="/proxy/stok-adjustments/export.xlsx" className={buttonClass('success')}>
                Export Excel
              </a>
              <Link href="/persediaan/penyesuaian/baru" className={buttonClass('primary')}>
                + Opname Baru
              </Link>
            </>
          }
        />

        <Table>
          <THead>
            <TH>No / Tgl</TH>
            <TH>Alasan</TH>
            <TH>Cabang</TH>
            <TH>Periode</TH>
            <TH numeric>Δ Nilai</TH>
            <TH className="text-center">Status</TH>
          </THead>
          <TBody>
            {rows.map((r) => {
              const delta = Number(r.totalDeltaNilai);
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/persediaan/penyesuaian/${r.id}`}
                      className="font-mono text-sogan-500 font-semibold hover:underline">
                      {r.nomor ?? '— draft —'}
                    </Link>
                    <div className="text-xs text-tanah-500">{fmtTanggal(r.tanggal)} · {r._count.lines} item</div>
                  </TD>
                  <TD className="text-tanah-700">{r.alasan}</TD>
                  <TD className="font-mono text-xs text-tanah-500">{r.cabang.kode}</TD>
                  <TD className="text-xs text-tanah-500">{r.fiscalPeriod.label}</TD>
                  <MoneyCell className={delta < 0 ? 'text-bata-700' : 'text-padi-700'}>
                    {delta >= 0 ? '+' : ''}{fmtRp(delta)}
                  </MoneyCell>
                  <TD className="text-center">
                    <StatusBadge status={r.status} />
                  </TD>
                </TR>
              );
            })}
            {rows.length === 0 && <EmptyRow colSpan={6}>Belum ada opname.</EmptyRow>}
          </TBody>
        </Table>
      </PageContainer>
    </>
  );
}
