import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canCancelPosted, canPostAccounting } from '@/lib/roles';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { apiErrorToState, type FormState } from '@/lib/form-state';
import { DisposeForm } from '@/components/DisposeForm';
import { BackLink } from '@/components/BackLink';
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

async function disposeAction(_prev: FormState, formData: FormData): Promise<FormState> {
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
  try {
    await apiFetch(`/aset/${id}/dispose`, {
      method: 'POST', tenantId,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath(`/aset/${id}`);
  return { ok: true };
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
        <BackLink href="/aset/daftar" label="← Kembali ke daftar aset" />
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Stat label="Harga Perolehan" value={fmtRp(aset.hargaPerolehan)} />
          <Stat label="Akumulasi" value={fmtRp(aset.akumulasiPenyusutan)} tone="bata" />
          <Stat label="Nilai Buku" value={fmtRp(aset.nilaiBuku)} tone="padi" big />
          <Stat label="Nilai Residu" value={fmtRp(aset.nilaiResidu)} />
        </div>

        <Card className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Akun Jurnal</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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
            <DisposeForm
              asetId={aset.id}
              today={new Date().toISOString().slice(0, 10)}
              kasBank={kasBank}
              action={disposeAction}
              cancelHref="/aset/daftar"
            />
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
