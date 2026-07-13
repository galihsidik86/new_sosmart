import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, FilterLabel, Select, Button, filterBarClass } from '@/components/ui';

interface PeriodYear {
  id: string; kode: string;
  periods: Array<{ id: string; label: string; status: string }>;
}
interface Project { id: string; kode: string; nama: string }
interface AuditRow {
  id: string; tanggal: string; sumber: string; noJurnal: string | null; noDokumen: string | null;
  pihak: string | null; deskripsi: string; nilai: string; cabangKode: string;
  proyek: { kode: string; nama: string }[]; linkBukti: string | null; sourceType: string; sourceId: string | null;
}
interface Resp { rows: AuditRow[]; total: number; totalNilai: string; terpotong: boolean }

const SUMBER: Record<string, string> = {
  MANUAL: 'Jurnal Manual', PENJUALAN: 'Penjualan', RETUR_JUAL: 'Retur Jual',
  PEMBELIAN: 'Pembelian', RETUR_BELI: 'Retur Beli', KAS_BANK: 'Kas/Bank',
  PENYUSUTAN: 'Penyusutan', PENYESUAIAN: 'Penyesuaian', TUTUP_BUKU: 'Tutup Buku',
  PAJAK: 'Pajak', SALDO_AWAL: 'Saldo Awal',
};

function docHref(sumber: string, sourceId: string | null): string | null {
  if (!sourceId) return null;
  if (sumber === 'PENJUALAN' || sumber === 'RETUR_JUAL') return `/transaksi/penjualan/${sourceId}`;
  if (sumber === 'PEMBELIAN' || sumber === 'RETUR_BELI') return `/transaksi/pembelian/${sourceId}`;
  if (sumber === 'KAS_BANK') return `/transaksi/kas-bank/${sourceId}`;
  return null;
}

export default async function JejakAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; sumber?: string; projectId?: string; search?: string; cabangId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const [years, projects, cabang] = await Promise.all([
    apiFetch<PeriodYear[]>('/periods/years', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }).catch(() => [] as Project[]),
    apiFetch<Project[]>('/cabang', { tenantId }).catch(() => [] as Project[]),
  ]);
  const isPusat = ['OWNER', 'ADMIN', 'AKUNTAN'].includes(s.role ?? '');
  const periodId =
    sp.periodId ?? years[0]?.periods.find((p) => p.status === 'OPEN')?.id ?? years[0]?.periods[0]?.id;
  const sumber = sp.sumber ?? '';
  const projectId = sp.projectId ?? '';
  const search = sp.search ?? '';
  const cabangId = sp.cabangId ?? '';

  const qs = new URLSearchParams();
  if (periodId) qs.set('periodId', periodId);
  if (sumber) qs.set('sumber', sumber);
  if (projectId) qs.set('projectId', projectId);
  if (search) qs.set('search', search);
  if (cabangId) qs.set('cabangId', cabangId);

  let data: Resp | null = null;
  if (periodId) data = await apiFetch<Resp>(`/reports/jejak-audit?${qs.toString()}`, { tenantId });

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Jejak Audit"
          subtitle="Daftar transaksi terposting dengan tautan bukti yang bisa diklik — mempermudah pemeriksaan/audit menemukan & menunjukkan bukti."
        />

        <form className={filterBarClass}>
          <FilterLabel>Periode</FilterLabel>
          <Select name="periodId" defaultValue={periodId} fullWidth={false}>
            {years[0]?.periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label} ({p.status})</option>
            ))}
          </Select>
          <Select name="sumber" defaultValue={sumber} fullWidth={false}>
            <option value="">— semua jenis —</option>
            {Object.entries(SUMBER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {isPusat && cabang.length > 1 && (
            <Select name="cabangId" defaultValue={cabangId} fullWidth={false}>
              <option value="">— semua cabang —</option>
              {cabang.map((c) => <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>)}
            </Select>
          )}
          {projects.length > 0 && (
            <Select name="projectId" defaultValue={projectId} fullWidth={false}>
              <option value="">— semua proyek —</option>
              <option value="none">— tanpa proyek —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>)}
            </Select>
          )}
          <input name="search" defaultValue={search} placeholder="cari no/keterangan…" className="border border-cream-300 rounded-lg px-3 py-1.5" />
          <Button type="submit" variant="secondary" size="sm" className="ml-auto">Cari</Button>
        </form>

        {data && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 text-sm text-tanah-600">
              <b>{data.total}</b> transaksi · total nilai <b>{fmtRp(data.totalNilai)}</b>
              {data.terpotong && <span className="text-bata-600"> · hasil dibatasi 500 baris — persempit filter</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 text-[10px] uppercase tracking-wider text-tanah-500">
                    <th className="px-3 py-2 text-left">Tgl</th>
                    <th className="px-3 py-2 text-left">Jenis</th>
                    <th className="px-3 py-2 text-left">No. Dokumen</th>
                    <th className="px-3 py-2 text-left">Pihak</th>
                    <th className="px-3 py-2 text-left">Keterangan</th>
                    <th className="px-3 py-2 text-left">Proyek</th>
                    <th className="px-3 py-2 text-right">Nilai</th>
                    <th className="px-3 py-2 text-center">Bukti</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const href = docHref(r.sumber, r.sourceId);
                    return (
                      <tr key={r.id} className="border-t border-cream-100 hover:bg-cream-50 align-top">
                        <td className="px-3 py-1.5 text-xs text-tanah-500 whitespace-nowrap">{fmtTanggal(r.tanggal)}</td>
                        <td className="px-3 py-1.5 text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-cream-100 text-tanah-600">{SUMBER[r.sumber] ?? r.sumber}</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-sogan-500">
                          {href ? <a href={href} className="hover:underline text-wedel-800">{r.noDokumen}</a> : r.noDokumen}
                          {r.noJurnal && r.noJurnal !== r.noDokumen && <div className="text-tanah-500 text-[10px]">{r.noJurnal}</div>}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-tanah-700">{r.pihak ?? '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-tanah-600 max-w-xs">{r.deskripsi}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {r.proyek.map((p) => (
                            <span key={p.kode} title={p.nama} className="inline-block px-1.5 py-0.5 rounded bg-cream-100 text-wedel-800 font-mono text-[10px] mr-1">{p.kode}</span>
                          ))}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">{fmtRp(r.nilai)}</td>
                        <td className="px-3 py-1.5 text-center">
                          {r.linkBukti
                            ? <a href={r.linkBukti} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-padi-100 text-padi-700 hover:bg-padi-200 text-xs font-semibold">🔗 Bukti</a>
                            : <span className="text-tanah-300 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}
