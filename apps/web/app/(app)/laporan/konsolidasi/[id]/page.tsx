import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Badge, StatusBanner, FormField, Input, Button,
  Table, THead, TH, TBody, TR, TD, SectionHeader,
} from '@/components/ui';

interface Row {
  kode: string; nama: string; kind: string; isIntercompany: boolean;
  combined: string; eliminasi: string; konsolidasi: string;
}
interface Report {
  group: { id: string; nama: string };
  entities: Array<{ tenantId: string; nama: string; ownershipPct: string; isParent: boolean; netAssets: string; netIncome: string }>;
  skippedTenantIds: string[];
  goodwill: { total: string; detail: Array<{ nama: string; goodwill: string }> };
  icRekon: Array<{ dari: string; ke: string; piutang: string; utangLawan: string; selisih: string; cocok: boolean }>;
  neraca: {
    rows: Row[]; totalAset: string; totalLiabilitas: string;
    totalEkuitasKonsolidasi: string; eliminasiEkuitasAkuisisi: string; ekuitasIndukInduk: string; kepentinganMinoritas: string;
  };
  labaRugi: {
    rows: Row[]; pendapatan: string; beban: string;
    labaBersihKonsolidasi: string; labaIndukInduk: string; labaMinoritas: string;
  };
  balanced: boolean; selisih: string;
}

const KIND_LABEL: Record<string, string> = {
  ASET: 'Aset', LIABILITAS: 'Liabilitas', EKUITAS: 'Ekuitas',
  PENDAPATAN: 'Pendapatan', PENDAPATAN_LAIN: 'Pendapatan Lain',
  BEBAN: 'Beban', BEBAN_POKOK: 'Beban Pokok', BEBAN_LAIN: 'Beban Lain',
};

function RowsTable({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <THead>
        <TH>Kode</TH>
        <TH>Akun</TH>
        <TH numeric>Gabungan</TH>
        <TH numeric>Eliminasi</TH>
        <TH numeric>Konsolidasi</TH>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.kode} className={r.isIntercompany ? 'bg-emas-50/50' : ''}>
            <TD className="font-mono text-xs text-tanah-500">{r.kode}</TD>
            <TD className="text-tanah-700">
              {r.nama}
              {r.isIntercompany && <Badge variant="neutral" className="ml-2">IC</Badge>}
            </TD>
            <TD className="text-right font-mono tabular-nums text-tanah-500">{fmtRp(r.combined)}</TD>
            <TD className="text-right font-mono tabular-nums text-bata-700">{Number(r.eliminasi) ? fmtRp(r.eliminasi) : '—'}</TD>
            <TD className="text-right font-mono tabular-nums font-semibold">{fmtRp(r.konsolidasi)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export default async function KonsolidasiReportPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const sp = await searchParams;
  const endDate = sp.endDate ?? new Date().toISOString().slice(0, 10);

  let rep: Report | null = null;
  let err: string | null = null;
  try {
    const qs = new URLSearchParams({ groupId: id, endDate });
    if (sp.startDate) qs.set('startDate', sp.startDate);
    rep = await apiFetch<Report>(`/consolidation/report?${qs.toString()}`, { tenantId });
  } catch (e) {
    err = e instanceof Error ? e.message : 'Gagal memuat konsolidasi';
  }

  const neracaByKind = (kind: string) => rep!.neraca.rows.filter((r) => r.kind === kind);

  return (
    <PageContainer size="report">
      <Link href="/laporan/konsolidasi" className="text-sm text-sogan-500 hover:underline">← Grup</Link>
      <PageHeader
        className="mt-2"
        title={rep ? `Konsolidasi — ${rep.group.nama}` : 'Konsolidasi'}
        subtitle={`Per ${endDate}${sp.startDate ? ` · L/R sejak ${sp.startDate}` : ' · L/R sejak awal'}`}
      />

      {/* Periode */}
      <Card className="mb-6" padding="lg">
        <form className="flex flex-wrap items-end gap-3">
          <FormField label="L/R dari (opsional)">
            <Input type="date" name="startDate" defaultValue={sp.startDate ?? ''} />
          </FormField>
          <FormField label="Per tanggal (Neraca)">
            <Input type="date" name="endDate" defaultValue={endDate} required />
          </FormField>
          <Button type="submit" variant="secondary">Terapkan</Button>
        </form>
      </Card>

      {err && <StatusBanner tone="danger">{err}</StatusBanner>}

      {rep && (
        <>
          {rep.skippedTenantIds.length > 0 && (
            <div className="mb-4">
              <StatusBanner tone="warning">
                {rep.skippedTenantIds.length} tenant anggota dilewati karena Anda bukan anggotanya (RLS).
              </StatusBanner>
            </div>
          )}

          {/* Entitas */}
          <Card className="mb-6" padding="lg">
            <SectionHeader className="mb-3">Entitas ({rep.entities.length})</SectionHeader>
            <Table>
              <THead>
                <TH>Badan Usaha</TH>
                <TH className="text-center">Kepemilikan</TH>
                <TH numeric>Aset Bersih</TH>
                <TH numeric>Laba Bersih</TH>
              </THead>
              <TBody>
                {rep.entities.map((e) => (
                  <TR key={e.tenantId}>
                    <TD className="text-tanah-700">
                      {e.nama} {e.isParent && <Badge variant="brand" className="ml-1">Induk</Badge>}
                    </TD>
                    <TD className="text-center font-mono tabular-nums">{e.ownershipPct}%</TD>
                    <TD className="text-right font-mono tabular-nums">{fmtRp(e.netAssets)}</TD>
                    <TD className="text-right font-mono tabular-nums">{fmtRp(e.netIncome)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          {/* Goodwill (metode akuisisi) */}
          {Number(rep.goodwill.total) !== 0 && (
            <Card className="mb-6" padding="lg">
              <SectionHeader className="mb-3">Goodwill (Metode Akuisisi)</SectionHeader>
              <Table>
                <THead><TH>Anak</TH><TH numeric>Goodwill</TH></THead>
                <TBody>
                  {rep.goodwill.detail.map((g) => (
                    <TR key={g.nama}><TD className="text-tanah-700">{g.nama}</TD><TD className="text-right font-mono tabular-nums">{fmtRp(g.goodwill)}</TD></TR>
                  ))}
                  <TR><TD className="font-semibold text-tanah-700">Total Goodwill</TD><TD className="text-right font-mono tabular-nums font-semibold">{fmtRp(rep.goodwill.total)}</TD></TR>
                </TBody>
              </Table>
              <p className="text-xs text-tanah-500 mt-2">Goodwill = biaya perolehan − (kepemilikan% × aset bersih anak saat akuisisi). Diakui sebagai aset konsolidasi.</p>
            </Card>
          )}

          {/* Rekonsiliasi intercompany level-transaksi */}
          {rep.icRekon.length > 0 && (
            <Card className="mb-6" padding="lg">
              <SectionHeader className="mb-3">Rekonsiliasi Intercompany (Piutang ↔ Utang)</SectionHeader>
              <Table>
                <THead>
                  <TH>Dari → Ke</TH><TH numeric>Piutang</TH><TH numeric>Utang lawan</TH>
                  <TH numeric>Selisih</TH><TH className="text-center">Cocok</TH>
                </THead>
                <TBody>
                  {rep.icRekon.map((r, i) => (
                    <TR key={i}>
                      <TD className="text-tanah-700">{r.dari} → {r.ke}</TD>
                      <TD className="text-right font-mono tabular-nums">{fmtRp(r.piutang)}</TD>
                      <TD className="text-right font-mono tabular-nums">{fmtRp(r.utangLawan)}</TD>
                      <TD className="text-right font-mono tabular-nums">{fmtRp(r.selisih)}</TD>
                      <TD className="text-center"><Badge variant={r.cocok ? 'success' : 'danger'}>{r.cocok ? '✓' : 'beda'}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <p className="text-xs text-tanah-500 mt-2">Piutang antar-perusahaan seharusnya sama dengan utang lawannya. Selisih ≠ 0 → perlu ditelusuri sebelum konsolidasi final.</p>
            </Card>
          )}

          {/* Neraca konsolidasi */}
          <Card className="mb-6" padding="lg">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader className="mb-0">Neraca Konsolidasi</SectionHeader>
              <Badge variant={rep.balanced ? 'success' : 'danger'}>
                {rep.balanced ? 'Seimbang' : `Selisih ${fmtRp(rep.selisih)}`}
              </Badge>
            </div>
            {(['ASET', 'LIABILITAS', 'EKUITAS'] as const).map((k) =>
              neracaByKind(k).length ? (
                <div key={k} className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider text-tanah-500 font-bold mb-1">{KIND_LABEL[k]}</div>
                  <RowsTable rows={neracaByKind(k)} />
                </div>
              ) : null,
            )}
            <dl className="text-sm space-y-1 border-t border-cream-200 pt-3 mt-2 max-w-sm ml-auto">
              <div className="flex justify-between"><dt className="text-tanah-500">Total Aset</dt><dd className="font-mono tabular-nums font-semibold">{fmtRp(rep.neraca.totalAset)}</dd></div>
              <div className="flex justify-between"><dt className="text-tanah-500">Total Liabilitas</dt><dd className="font-mono tabular-nums">{fmtRp(rep.neraca.totalLiabilitas)}</dd></div>
              {Number(rep.neraca.eliminasiEkuitasAkuisisi) !== 0 && (
                <div className="flex justify-between"><dt className="text-tanah-500">Eliminasi ekuitas anak (akuisisi/investasi)</dt><dd className="font-mono tabular-nums text-bata-700">{fmtRp(rep.neraca.eliminasiEkuitasAkuisisi)}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-tanah-500">Ekuitas — Induk</dt><dd className="font-mono tabular-nums">{fmtRp(rep.neraca.ekuitasIndukInduk)}</dd></div>
              <div className="flex justify-between"><dt className="text-tanah-500">Kepentingan Minoritas (NCI)</dt><dd className="font-mono tabular-nums text-wedel-900">{fmtRp(rep.neraca.kepentinganMinoritas)}</dd></div>
              <div className="flex justify-between border-t border-cream-200 pt-1 font-semibold"><dt className="text-tanah-700">Total Ekuitas</dt><dd className="font-mono tabular-nums">{fmtRp(rep.neraca.totalEkuitasKonsolidasi)}</dd></div>
            </dl>
          </Card>

          {/* Laba rugi konsolidasi */}
          <Card padding="lg">
            <SectionHeader className="mb-3">Laba Rugi Konsolidasi</SectionHeader>
            <RowsTable rows={rep.labaRugi.rows} />
            <dl className="text-sm space-y-1 border-t border-cream-200 pt-3 mt-2 max-w-sm ml-auto">
              <div className="flex justify-between"><dt className="text-tanah-500">Pendapatan</dt><dd className="font-mono tabular-nums">{fmtRp(rep.labaRugi.pendapatan)}</dd></div>
              <div className="flex justify-between"><dt className="text-tanah-500">Beban</dt><dd className="font-mono tabular-nums text-bata-700">({fmtRp(rep.labaRugi.beban)})</dd></div>
              <div className="flex justify-between border-t border-cream-200 pt-1 font-semibold"><dt className="text-tanah-700">Laba Bersih Konsolidasi</dt><dd className="font-mono tabular-nums">{fmtRp(rep.labaRugi.labaBersihKonsolidasi)}</dd></div>
              <div className="flex justify-between"><dt className="text-tanah-500">— Diatribusikan ke induk</dt><dd className="font-mono tabular-nums">{fmtRp(rep.labaRugi.labaIndukInduk)}</dd></div>
              <div className="flex justify-between"><dt className="text-tanah-500">— Kepentingan minoritas</dt><dd className="font-mono tabular-nums text-wedel-900">{fmtRp(rep.labaRugi.labaMinoritas)}</dd></div>
            </dl>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
