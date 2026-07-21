import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtPlain, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, FilterLabel, Select, Button, filterBarClass,
} from '@/components/ui';
import { buttonClass } from '@/components/ui';
import Link from 'next/link';

interface PeriodYear { id: string; kode: string }
interface KoreksiRow {
  sumber: 'OTOMATIS' | 'MANUAL';
  jenis: 'POSITIF' | 'NEGATIF';
  beda: 'TETAP' | 'SEMENTARA';
  kategori: string;
  deskripsi: string;
  akunKode: string | null;
  koreksi: string;
}
interface Rekon {
  fiscalYear: { id: string; kode: string; startDate: string; endDate: string };
  labaKomersial: string;
  koreksi: KoreksiRow[];
  totalKoreksiPositif: string;
  totalKoreksiNegatif: string;
  labaFiskal: string;
  kompensasi: { items: Array<{ tahunRugi: string; nilaiRugi: string; dipakai: string }>; terpakai: string };
  pkp: string;
  pph: {
    skema: string; tarif: string; peredaranBruto: string; useFasilitas31E: boolean;
    terutang: string; kreditPajak: string; kurangBayar: string;
  };
  pajakTangguhan?: { bedaTemporerNeto: string; manfaat: string; jenis: string };
  bebanPajak?: { kini: string; tangguhan: string; total: string };
  finalized?: boolean;
  finalizedAt?: string | null;
}

const KAT_LABEL: Record<string, string> = {
  NATURA: 'Natura/kenikmatan', ENTERTAINMENT: 'Entertainment', SUMBANGAN: 'Sumbangan',
  SANKSI_PAJAK: 'Sanksi pajak', PENGHASILAN_FINAL: 'Penghasilan final', BUNGA: 'Bunga',
  SEWA: 'Sewa', PENYUSUTAN: 'Penyusutan', CADANGAN: 'Cadangan', LAINNYA: 'Lainnya',
};

export default async function RekonsiliasiFiskalPage({
  searchParams,
}: {
  searchParams: Promise<{ fiscalYearId?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const years = await apiFetch<PeriodYear[]>('/periods/years', { tenantId });
  const fyId = sp.fiscalYearId || years[0]?.id;

  const rekon = fyId
    ? await apiFetch<Rekon>(`/fiskal/rekonsiliasi?fiscalYearId=${fyId}`, { tenantId }).catch(() => null)
    : null;

  const posRows = rekon?.koreksi.filter((k) => k.jenis === 'POSITIF') ?? [];
  const negRows = rekon?.koreksi.filter((k) => k.jenis === 'NEGATIF') ?? [];
  const kurang = rekon ? Number(rekon.pph.kurangBayar) : 0;

  async function finalize() {
    'use server';
    const t = await getActiveTenantId(); if (!t) redirect('/login');
    if (fyId) await apiFetch(`/fiskal/rekonsiliasi/${fyId}/finalize`, { method: 'POST', tenantId: t });
    revalidatePath('/laporan/rekonsiliasi-fiskal');
  }
  async function reopen() {
    'use server';
    const t = await getActiveTenantId(); if (!t) redirect('/login');
    if (fyId) await apiFetch(`/fiskal/rekonsiliasi/${fyId}/reopen`, { method: 'POST', tenantId: t });
    revalidatePath('/laporan/rekonsiliasi-fiskal');
  }

  return (
    <PageContainer size="report">
      <PageHeader
        title="Rekonsiliasi Fiskal"
        subtitle="Laba komersial → koreksi fiskal → laba kena pajak → PPh Badan. Basis lampiran SPT Tahunan 1771."
        actions={
          <div className="flex items-center gap-2">
            {rekon?.finalized ? (
              <form action={reopen}><Button type="submit" variant="secondary" size="sm">Buka kembali</Button></form>
            ) : rekon ? (
              <form action={finalize}><Button type="submit" size="sm">Finalkan</Button></form>
            ) : null}
            <Link href="/pajak/rekonsiliasi-fiskal" className={buttonClass('secondary')}>Kelola parameter</Link>
          </div>
        }
      />

      <form className={filterBarClass}>
        <div>
          <FilterLabel>Tahun Fiskal</FilterLabel>
          <Select name="fiscalYearId" defaultValue={fyId}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.kode}</option>)}
          </Select>
        </div>
        <Button type="submit" className="self-end">Tampilkan</Button>
      </form>

      {!rekon ? (
        <div className="mt-6 text-sm text-tanah-500">Pilih tahun fiskal untuk menampilkan rekonsiliasi.</div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <div className="text-center py-4 border-b border-cream-200">
            <div className="font-display text-lg font-semibold text-wedel-900">{s.tenantNama}</div>
            <div className="text-sm text-tanah-700">Rekonsiliasi Fiskal — Tahun {rekon.fiscalYear.kode}</div>
            <div className="text-xs text-tanah-500">
              {fmtTanggal(rekon.fiscalYear.startDate)} s/d {fmtTanggal(rekon.fiscalYear.endDate)}
            </div>
            {rekon.finalized && (
              <div className="mt-2 inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-padi-100 text-padi-700">
                ✓ Final (beku){rekon.finalizedAt ? ` · ${fmtTanggal(rekon.finalizedAt)}` : ''}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-[11px] uppercase tracking-wider text-tanah-500">
                <tr>
                  <th className="px-4 py-2 text-left font-bold">Uraian</th>
                  <th className="px-4 py-2 text-right font-bold w-40">Koreksi (+)</th>
                  <th className="px-4 py-2 text-right font-bold w-40">Koreksi (−)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                <tr className="bg-cream-50/50">
                  <td className="px-4 py-2 font-semibold text-tanah-700">Laba (rugi) komersial sebelum pajak</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold" colSpan={2}>{fmtRp(rekon.labaKomersial)}</td>
                </tr>

                {posRows.length > 0 && (
                  <tr><td className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-bata-700 font-bold" colSpan={3}>Koreksi Positif</td></tr>
                )}
                {posRows.map((k, i) => (
                  <tr key={'p' + i}>
                    <td className="px-4 py-1.5">
                      {k.deskripsi}
                      <span className="ml-2 text-[10px] text-tanah-500">
                        {KAT_LABEL[k.kategori] ?? k.kategori}{k.akunKode ? ` · ${k.akunKode}` : ''} · {k.beda === 'TETAP' ? 'tetap' : 'sementara'}
                        {k.sumber === 'MANUAL' ? ' · manual' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums text-bata-700">{fmtPlain(k.koreksi)}</td>
                    <td />
                  </tr>
                ))}
                {negRows.length > 0 && (
                  <tr><td className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-padi-700 font-bold" colSpan={3}>Koreksi Negatif</td></tr>
                )}
                {negRows.map((k, i) => (
                  <tr key={'n' + i}>
                    <td className="px-4 py-1.5">
                      {k.deskripsi}
                      <span className="ml-2 text-[10px] text-tanah-500">
                        {KAT_LABEL[k.kategori] ?? k.kategori}{k.akunKode ? ` · ${k.akunKode}` : ''} · {k.beda === 'TETAP' ? 'tetap' : 'sementara'}
                        {k.sumber === 'MANUAL' ? ' · manual' : ''}
                      </span>
                    </td>
                    <td />
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums text-padi-700">{fmtPlain(k.koreksi)}</td>
                  </tr>
                ))}
                {rekon.koreksi.length === 0 && (
                  <tr><td className="px-4 py-2 text-tanah-500 text-xs" colSpan={3}>Belum ada koreksi fiskal (atur atribut akun / koreksi manual).</td></tr>
                )}

                <tr className="border-t-2 border-cream-300 bg-cream-50 font-semibold text-tanah-700">
                  <td className="px-4 py-2">Jumlah koreksi</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-bata-700">{fmtPlain(rekon.totalKoreksiPositif)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-padi-700">{fmtPlain(rekon.totalKoreksiNegatif)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <dl className="px-4 py-4 space-y-1.5 text-sm border-t-2 border-cream-300">
            <Line label="Laba fiskal (Penghasilan Neto Fiskal)" value={fmtRp(rekon.labaFiskal)} bold />
            <Line label={`Kompensasi kerugian${rekon.kompensasi.items.length ? ` (${rekon.kompensasi.items.length} th)` : ''}`} value={'(' + fmtPlain(rekon.kompensasi.terpakai) + ')'} />
            <Line label="Penghasilan Kena Pajak (PKP)" value={fmtRp(rekon.pkp)} bold />
            <Line
              label={`PPh Badan terutang (${rekon.pph.skema === 'UMKM_FINAL' ? '0,5% final' : rekon.pph.useFasilitas31E ? `${Number(rekon.pph.tarif)}% + fasilitas 31E` : `${Number(rekon.pph.tarif)}%`})`}
              value={fmtRp(rekon.pph.terutang)}
            />
            <Line label="Kredit pajak (PPh 22/23/25)" value={'(' + fmtPlain(rekon.pph.kreditPajak) + ')'} />
            <div className="flex justify-between pt-2 mt-1 border-t border-cream-300">
              <dt className="font-bold text-tanah-900">{kurang >= 0 ? 'PPh Pasal 29 (kurang bayar)' : 'PPh Pasal 28A (lebih bayar)'}</dt>
              <dd className={`font-mono tabular-nums font-bold text-base ${kurang >= 0 ? 'text-bata-700' : 'text-padi-700'}`}>
                {fmtRp(Math.abs(kurang))}
              </dd>
            </div>
          </dl>

          {rekon.pajakTangguhan && rekon.bebanPajak && (
            <div className="px-4 pb-4">
              <div className="text-[11px] uppercase tracking-wide text-tanah-500 font-bold mb-1.5 pt-3 border-t border-cream-200">
                Pajak Tangguhan (PSAK 46)
              </div>
              <dl className="space-y-1.5 text-sm">
                <Line label="Beda temporer (sementara) neto" value={fmtRp(rekon.pajakTangguhan.bedaTemporerNeto)} />
                <Line
                  label={`Pajak tangguhan — ${rekon.pajakTangguhan.jenis === 'ASET' ? 'manfaat (aset)' : 'beban (liabilitas)'}`}
                  value={fmtRp(Math.abs(Number(rekon.pajakTangguhan.manfaat)))}
                />
                <Line label="Total beban pajak penghasilan (kini + tangguhan)" value={fmtRp(rekon.bebanPajak.total)} bold />
              </dl>
              <p className="text-[10px] text-tanah-500 mt-1.5">
                Estimasi PSAK 46 dari beda waktu tahun berjalan (tarif {Number(rekon.pph.tarif)}%). Indikatif — belum memperhitungkan saldo pajak tangguhan awal.
              </p>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-tanah-500">
        Koreksi <b>otomatis</b> berasal dari Atribut Fiskal akun &amp; selisih penyusutan komersial vs fiskal;
        koreksi <b>manual</b> &amp; parameter PPh diatur di <Link href="/pajak/rekonsiliasi-fiskal" className="text-sogan-500 hover:underline">Kelola parameter</Link>.
        Rekonsiliasi paling akurat di akhir tahun buku (12 bulan penyusutan komersial telah diposting).
      </p>
    </PageContainer>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={bold ? 'font-semibold text-tanah-900' : 'text-tanah-500'}>{label}</dt>
      <dd className={`font-mono tabular-nums ${bold ? 'font-semibold text-tanah-900' : 'text-tanah-700'}`}>{value}</dd>
    </div>
  );
}
