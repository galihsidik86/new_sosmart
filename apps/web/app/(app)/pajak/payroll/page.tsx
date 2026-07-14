import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, Button, Badge, StatusBanner, buttonClass } from '@/components/ui';

interface Run {
  id: string;
  nomor: string | null;
  periode: string;
  tanggal: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED' | 'PARTIAL' | 'PAID';
  totalGajiPokok: string;
  totalTunjangan: string;
  totalPph21: string;
  totalTakeHome: string;
  cabang: { kode: string };
  fiscalPeriod: { label: string };
  _count: { lines: number };
}
interface Cabang { id: string; kode: string; nama: string }
interface PreviewLine {
  karyawanId: string; kode: string; nama: string;
  ptkpStatus: string; ptkpKategori: string;
  bruto: string; tarifTerPersen: string;
  pph21: string; iuranBpjs: string; takeHome: string;
  npwp: string | null;
  terUnverified: boolean;
}

/**
 * Server action: jalankan + post payroll. Semua data via hidden form fields
 * (cabangId, periode, akunKasBankId) — tidak pakai closure capture supaya
 * predictable & test-able.
 */
async function runAndPostPayroll(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const payload = {
    cabangId: String(formData.get('cabangId')),
    periode: String(formData.get('periode')),
    akunKasBankId: String(formData.get('akunKasBankId')),
  };
  const r = await apiFetch<{ id: string }>('/payroll/runs', {
    method: 'POST', tenantId, body: JSON.stringify(payload),
  });
  await apiFetch(`/payroll/runs/${r.id}/post`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ konfirmasiTerTinggi: formData.get('konfirmasiTerTinggi') === 'on' }),
  });
  revalidatePath('/pajak/payroll');
}

function nextPeriode(runs: Run[]): string {
  if (runs.length === 0) return '2026-05';
  const last = runs[0]!.periode;
  const [y, m] = last.split('-').map(Number);
  const nm = m! + 1;
  if (nm > 12) return `${y! + 1}-01`;
  return `${y}-${String(nm).padStart(2, '0')}`;
}

export default async function PayrollListPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; cabangId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const [runs, cabang, accounts] = await Promise.all([
    apiFetch<Run[]>('/payroll/runs', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<Array<{ id: string; kode: string; nama: string; isPostable: boolean }>>('/accounts?view=flat', { tenantId }),
  ]);
  const kasBank = accounts.filter((a) => a.isPostable && (a.kode === '1-101' || a.kode.startsWith('1-102')));

  const cabangId = sp.cabangId ?? cabang[0]?.id ?? '';
  const periode = sp.preview ?? nextPeriode(runs);

  let preview: PreviewLine[] = [];
  if (cabangId) {
    try {
      preview = await apiFetch<PreviewLine[]>(
        `/payroll/preview?cabangId=${cabangId}&periode=${periode}`,
        { tenantId },
      );
    } catch {
      preview = [];
    }
  }
  const totalPreviewPph21 = preview.reduce((a, r) => a + Number(r.pph21), 0);
  const totalPreviewTakeHome = preview.reduce((a, r) => a + Number(r.takeHome), 0);
  const adaTerTinggi = preview.some((l) => l.terUnverified);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Payroll Bulanan"
          subtitle={
            <>
              PPh 21 dihitung dengan TER (Tarif Efektif Rata-rata) bulanan PMK 168/2023.
              Auto-jurnal saat post: D Beban Gaji · K Utang PPh 21 · K Utang BPJS · K Kas/Bank.
            </>
          }
          actions={
            <a href="/proxy/payroll/runs/export.xlsx" className={buttonClass('success')}>Export Excel</a>
          }
        />

        <div className="mb-6 rounded-xl border border-padi-300 bg-padi-50 px-4 py-3 text-xs text-tanah-700">
          Tabel TER (Tarif Efektif Rata-rata) telah di-populate sesuai PMK 168/2023
          (44 bracket kategori A, 40 kategori B, 41 kategori C). Bracket di atas
          Rp 1 miliar/bulan (rate 30–34%) untuk kategori B &amp; C direkonstruksi dari
          pattern progresif — <strong>verifikasi ulang</strong> Lampiran PDF resmi PMK
          168/2023 kalau ada karyawan berpenghasilan &gt; Rp 700 juta/bulan.
        </div>

        <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 flex items-center justify-between">
            <div className="font-display text-xl font-semibold text-wedel-900">
              Preview Periode {periode}
            </div>
            <form className="flex items-center gap-2">
              <select name="cabangId" defaultValue={cabangId}
                className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm">
                {cabang.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}
              </select>
              <input name="preview" defaultValue={periode} pattern="\d{4}-\d{2}" placeholder="YYYY-MM"
                className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono w-28" />
              <Button type="submit" variant="secondary" size="sm">Lihat</Button>
            </form>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                <th className="px-3 py-2 font-bold">Karyawan</th>
                <th className="px-3 py-2 font-bold">PTKP / Kategori TER</th>
                <th className="px-3 py-2 font-bold">NPWP</th>
                <th className="px-3 py-2 font-bold text-right">Bruto</th>
                <th className="px-3 py-2 font-bold text-right">TER%</th>
                <th className="px-3 py-2 font-bold text-right">PPh 21</th>
                <th className="px-3 py-2 font-bold text-right">BPJS</th>
                <th className="px-3 py-2 font-bold text-right">Take-Home</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {preview.map((l) => (
                <tr key={l.karyawanId}>
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-xs text-tanah-700">{l.kode}</span>{' '}
                    <span className="text-tanah-700">{l.nama}</span>
                  </td>
                  <td className="px-3 py-1.5 text-xs font-mono text-tanah-500">
                    {l.ptkpStatus.replace('_', '/')} · {l.ptkpKategori}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-tanah-500">{l.npwp ? '✓' : <span className="text-bata-500">tanpa NPWP</span>}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(l.bruto)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-tanah-500">
                    {l.terUnverified ? (
                      <span className="inline-flex items-center gap-1 text-bata-700" title="Bruto tinggi — tarif TER belum diverifikasi ke PMK 168/2023">
                        <span aria-hidden>⚠</span>{l.tarifTerPersen}%
                      </span>
                    ) : (
                      <>{l.tarifTerPersen}%</>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-bata-700">{fmtRp(l.pph21)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-tanah-500">{fmtRp(l.iuranBpjs)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold">{fmtRp(l.takeHome)}</td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-tanah-500">Tidak ada karyawan aktif di cabang ini.</td></tr>
              )}
            </tbody>
            <tfoot className="bg-cream-50 font-bold text-tanah-700">
              <tr><td colSpan={5} className="px-3 py-2 text-right">TOTAL</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(totalPreviewPph21)}</td>
                <td /><td className="px-3 py-2 text-right font-mono tabular-nums">{fmtRp(totalPreviewTakeHome)}</td></tr>
            </tfoot>
          </table>
          {adaTerTinggi && (
            <div className="px-5 pt-3 bg-white border-t border-cream-200">
              <StatusBanner tone="danger">
                Ada karyawan dengan penghasilan bruto di atas Rp700.000.000/bulan. Tarif
                TER PPh 21 di zona itu masih <b>direkonstruksi</b> dan belum diverifikasi
                ke Lampiran PMK 168/2023 — <b>bisa salah secara hukum</b>. Verifikasi tarif
                (baris bertanda ⚠) ke sumber resmi DJP dulu, lalu centang konfirmasi
                untuk melanjutkan posting.
              </StatusBanner>
            </div>
          )}
          {preview.length > 0 && (
            <div className="px-5 py-3 bg-white border-t border-cream-200 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-tanah-500 max-w-md">
                Klik "Jalankan & Post" untuk simpan & post jurnal payroll + auto-generate bukti potong PPh 21 per karyawan.
              </p>
              <form action={runAndPostPayroll} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="cabangId" value={cabangId} />
                <input type="hidden" name="periode" value={periode} />
                {adaTerTinggi && (
                  <label className="flex items-center gap-2 text-xs text-bata-700 font-semibold max-w-xs">
                    <input type="checkbox" name="konfirmasiTerTinggi" required />
                    Saya sudah verifikasi tarif TER penghasilan tinggi terhadap PMK 168/2023
                  </label>
                )}
                <select name="akunKasBankId" required
                  className="px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono">
                  {kasBank.map((a) => <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>)}
                </select>
                <Button type="submit">
                  Jalankan & Post {periode}
                </Button>
              </form>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 font-display text-xl font-semibold text-wedel-900">
            Riwayat Payroll
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                <th className="px-4 py-2 font-bold">No / Periode</th>
                <th className="px-4 py-2 font-bold">Cabang</th>
                <th className="px-4 py-2 font-bold">Tanggal Posting</th>
                <th className="px-4 py-2 font-bold text-right">Jumlah Karyawan</th>
                <th className="px-4 py-2 font-bold text-right">Total Gaji</th>
                <th className="px-4 py-2 font-bold text-right">PPh 21</th>
                <th className="px-4 py-2 font-bold text-right">Take-Home</th>
                <th className="px-4 py-2 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-cream-50">
                  <td className="px-4 py-2">
                    {/* Detail page /pajak/payroll/[id] belum dibuat — tampilkan plain. */}
                    <span className="font-mono text-sogan-500 font-semibold">
                      {r.nomor ?? '— draft —'}
                    </span>
                    <div className="text-xs text-tanah-500">{r.periode}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-tanah-500">{r.cabang.kode}</td>
                  <td className="px-4 py-2 text-xs text-tanah-500">{fmtTanggal(r.tanggal)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{r._count.lines}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {fmtRp(Number(r.totalGajiPokok) + Number(r.totalTunjangan))}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-bata-700">{fmtRp(r.totalPph21)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmtRp(r.totalTakeHome)}</td>
                  <td className="px-4 py-2 text-center">
                    <Badge variant={r.status === 'POSTED' ? 'success' : r.status === 'DRAFT' ? 'warning' : 'neutral'}>
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-tanah-500">Belum ada payroll.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </PageContainer>
    </>
  );
}
