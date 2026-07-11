import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canCancelPosted, canPostAccounting } from '@/lib/roles';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, Card, Button, Badge, type BadgeVariant } from '@/components/ui';

type Status = 'AKTIF' | 'DIJUAL' | 'RUSAK' | 'PENSIUN';

const STATUS_VARIANT: Record<Status, BadgeVariant> = {
  AKTIF: 'success',
  DIJUAL: 'neutral',
  RUSAK: 'danger',
  PENSIUN: 'neutral',
};

interface Account { id: string; kode: string; nama: string }
interface Detail {
  id: string;
  kode: string;
  nama: string;
  kelompok: string;
  metode: 'GARIS_LURUS' | 'SALDO_MENURUN';
  tanggalPerolehan: string;
  mulaiPenyusutan: string;
  hargaPerolehan: string;
  nilaiResidu: string;
  masaManfaatBulan: number;
  akumulasiPenyusutan: string;
  nilaiBuku: string;
  lastDepresiasiPeriode: string | null;
  status: Status;
  tanggalDihentikan: string | null;
  hargaJualDisposal: string | null;
  disposalJournalId: string | null;
  catatan: string | null;
  cabang: { kode: string; nama: string };
  akunAset: { kode: string; nama: string };
  akunAkumulasi: { kode: string; nama: string };
  akunBeban: { kode: string; nama: string };
  depresiasiLines: Array<{
    nilai: string;
    nilaiBukuSebelum: string;
    nilaiBukuSesudah: string;
    akumulasiSesudah: string;
    run: { periode: string; status: string; tanggal: string };
  }>;
}

async function disposeAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  const payload = {
    tanggalDihentikan: String(formData.get('tanggalDihentikan')),
    statusBaru: String(formData.get('statusBaru')),
    hargaJual: String(formData.get('hargaJual') ?? '0'),
    akunKasBankId: (formData.get('akunKasBankId') as string) || undefined,
    catatan: (formData.get('catatan') as string) || undefined,
  };
  await apiFetch(`/aset/${id}/dispose`, {
    method: 'POST', tenantId,
    body: JSON.stringify(payload),
  });
  revalidatePath(`/aset/${id}`);
}

async function undisposeAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId(); if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/aset/${id}/undispose`, {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan: String(formData.get('alasan') ?? '') }),
  });
  revalidatePath(`/aset/${id}`);
}

export default async function AsetDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [aset, accounts] = await Promise.all([
    apiFetch<Detail>(`/aset/${id}`, { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
  ]);
  const kasBank = accounts.filter((a) => a.kode === '1-101' || a.kode.startsWith('1-102'));
  const mayDispose = canPostAccounting(s.role);
  const mayUndispose = canCancelPosted(s.role);

  return (
    <>
      <PageContainer size="form">
        <PageHeader
          title={`${aset.kode} — ${aset.nama}`}
          actions={<Badge variant={STATUS_VARIANT[aset.status]} size="md">{aset.status}</Badge>}
          subtitle={
            <>
              {aset.kelompok.replace(/_/g, ' ')} · {aset.metode === 'GARIS_LURUS' ? 'Garis Lurus' : 'Saldo Menurun'} ·
              masa {aset.masaManfaatBulan} bulan · cabang {aset.cabang.kode}
              <span className="block text-xs mt-1">
                Perolehan {fmtTanggal(aset.tanggalPerolehan)} · Mulai disusutkan {fmtTanggal(aset.mulaiPenyusutan)}
                {aset.lastDepresiasiPeriode && <span> · Terakhir: {aset.lastDepresiasiPeriode}</span>}
              </span>
            </>
          }
        />

        <div className="grid grid-cols-4 gap-4 mb-6">
          <Stat label="Harga Perolehan" value={fmtRp(aset.hargaPerolehan)} />
          <Stat label="Akumulasi" value={fmtRp(aset.akumulasiPenyusutan)} tone="bata" />
          <Stat label="Nilai Buku" value={fmtRp(aset.nilaiBuku)} tone="padi" big />
          <Stat label="Nilai Residu" value={fmtRp(aset.nilaiResidu)} />
        </div>

        <Card className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Akun Jurnal</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-tanah-500">Aset</div>
              <div className="font-mono text-tanah-700">{aset.akunAset.kode}</div>
              <div className="text-xs text-tanah-500">{aset.akunAset.nama}</div>
            </div>
            <div>
              <div className="text-xs text-tanah-500">Akumulasi</div>
              <div className="font-mono text-tanah-700">{aset.akunAkumulasi.kode}</div>
              <div className="text-xs text-tanah-500">{aset.akunAkumulasi.nama}</div>
            </div>
            <div>
              <div className="text-xs text-tanah-500">Beban Penyusutan</div>
              <div className="font-mono text-tanah-700">{aset.akunBeban.kode}</div>
              <div className="text-xs text-tanah-500">{aset.akunBeban.nama}</div>
            </div>
          </div>
        </Card>

        {aset.depresiasiLines.length > 0 && (
          <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 text-xs uppercase tracking-wider text-tanah-500 font-bold">
              Riwayat Penyusutan
            </div>
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-3 py-2 font-bold">Periode</th>
                  <th className="px-3 py-2 font-bold">Posting</th>
                  <th className="px-3 py-2 font-bold text-right">Nilai Buku Sebelum</th>
                  <th className="px-3 py-2 font-bold text-right">Penyusutan</th>
                  <th className="px-3 py-2 font-bold text-right">Akumulasi Sesudah</th>
                  <th className="px-3 py-2 font-bold text-right">Nilai Buku Sesudah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {aset.depresiasiLines.map((l, i) => (
                  <tr key={i} className={l.run.status !== 'POSTED' ? 'text-tanah-500' : ''}>
                    <td className="px-3 py-1.5 font-mono">{l.run.periode}</td>
                    <td className="px-3 py-1.5 text-xs text-tanah-500">{fmtTanggal(l.run.tanggal)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(l.nilaiBukuSebelum)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-bata-700">−{fmtRp(l.nilai)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtRp(l.akumulasiSesudah)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold">{fmtRp(l.nilaiBukuSesudah)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Dispose / undispose */}
        {aset.status === 'AKTIF' && !mayDispose ? (
          <Card>
            <span className="px-3 py-2 bg-emas-100 text-emas-700 text-xs rounded-lg border border-emas-300 inline-block">
              Penghentian aset perlu role Akuntan/Admin
            </span>
          </Card>
        ) : aset.status === 'AKTIF' ? (
          <Card>
            <h2 className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Penghentian Aset</h2>
            <form action={disposeAction} className="grid grid-cols-2 gap-3 text-sm">
              <input type="hidden" name="id" value={aset.id} />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tanggal</label>
                <input type="date" name="tanggalDihentikan" required defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Status Baru</label>
                <select name="statusBaru" required defaultValue="DIJUAL"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                  <option value="DIJUAL">DIJUAL</option>
                  <option value="RUSAK">RUSAK</option>
                  <option value="PENSIUN">PENSIUN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Harga Jual (kalau DIJUAL)</label>
                <input type="number" min={0} step="0.01" name="hargaJual" defaultValue="0"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm text-right font-mono tabular-nums" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akun Kas/Bank Terima</label>
                <select name="akunKasBankId"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono">
                  <option value="">— pilih —</option>
                  {kasBank.map((a) => <option key={a.id} value={a.id}>{a.kode}  {a.nama}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Catatan</label>
                <input type="text" name="catatan" placeholder="(opsional)"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button type="submit" variant="danger">
                  Hentikan Aset (auto-jurnal)
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card>
            <div className="text-sm text-tanah-500 mb-2">
              Aset sudah {aset.status} pada {aset.tanggalDihentikan ? fmtTanggal(aset.tanggalDihentikan) : '—'}.
              {aset.disposalJournalId && (
                <> Jurnal: <Link href={`/pembukuan/jurnal/${aset.disposalJournalId}`} className="text-sogan-500 font-mono hover:underline">lihat</Link></>
              )}
            </div>
            {mayUndispose && (
              <form action={undisposeAction} className="flex gap-2">
                <input type="hidden" name="id" value={aset.id} />
                <input name="alasan" required minLength={5} placeholder="Alasan reverse dispose…"
                  className="px-3 py-2 bg-white border border-cream-300 rounded-md text-sm w-72" />
                <Button type="submit" variant="secondary">
                  Reverse Dispose
                </Button>
              </form>
            )}
          </Card>
        )}
      </PageContainer>
    </>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: 'padi' | 'bata'; big?: boolean }) {
  const cls = tone === 'padi' ? 'text-padi-700' : tone === 'bata' ? 'text-bata-700' : 'text-wedel-900';
  return (
    <div className="bg-white border border-cream-200 rounded-xl p-4 shadow-sm">
      <div className="text-[10px] uppercase tracking-wider text-tanah-500 font-bold">{label}</div>
      <div className={`font-display font-semibold tabular-nums mt-1 ${cls} ${big ? 'text-2xl' : 'text-lg'}`}>
        {value}
      </div>
    </div>
  );
}
