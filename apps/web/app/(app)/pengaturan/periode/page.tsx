import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtTanggal } from '@/lib/format';
import { canAdmin } from '@/lib/roles';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input,
  THead, TH, TBody, TR, TD, StatusBanner, buttonClass, type BadgeVariant,
} from '@/components/ui';
import { BackLink } from '@/components/BackLink';

interface PeriodRow {
  id: string;
  no: number;
  label: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
  closedAt: string | null;
  catatanTutup: string | null;
}
interface YearRow {
  id: string;
  kode: string;
  status: 'OPEN' | 'CLOSED';
  startDate: string;
  endDate: string;
  periods: PeriodRow[];
}

const PATH = '/pengaturan/periode';

/**
 * `apiFetch` melempar `Error("API {status}: {jsonBody}")` (lihat lib/api.ts).
 * Tanpa ini, error apa pun dari API (mis. "tutup periode Feb 2026 dulu")
 * jatuh sampai ke Next.js dev overlay / generic error page — sama pola yang
 * dipakai di wizard Saldo Awal (apps/web/app/(app)/pengaturan/saldo-awal/page.tsx).
 */
function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Terjadi kesalahan tak terduga.';
  const m = err.message.match(/^API \d+: (.+)$/s);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (typeof body?.message === 'string') return body.message;
    } catch {
      // bukan JSON — pakai raw text
    }
    return m[1];
  }
  return err.message;
}

async function runAction(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    redirect(`${PATH}?error=${encodeURIComponent(extractErrorMessage(e))}`);
  }
  revalidatePath(PATH);
  redirect(PATH);
}

async function closePeriodAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/periods/close', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      periodId: formData.get('periodId'),
      catatan: formData.get('catatan') || undefined,
    }),
  }));
}

async function reopenPeriodAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/periods/reopen', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      periodId: formData.get('periodId'),
      alasan: formData.get('alasan'),
    }),
  }));
}

async function closeYearAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/periods/close-year', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      fiscalYearId: formData.get('fiscalYearId'),
      catatan: formData.get('catatan') || undefined,
    }),
  }));
}

async function reopenYearAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/periods/reopen-year', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      fiscalYearId: formData.get('fiscalYearId'),
      alasan: formData.get('alasan'),
    }),
  }));
}

async function createFiscalYearAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  // Input <input type="month"> kasih value "YYYY-MM" — tahun buku selalu
  // mulai tanggal 1, jadi tinggal tambah "-01" tanpa perlu date picker penuh.
  const bulanMulai = formData.get('startDate');
  await runAction(() => apiFetch('/periods/years', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      startDate: `${bulanMulai}-01`,
    }),
  }));
}

export default async function PeriodePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const years = await apiFetch<YearRow[]>('/periods/years', { tenantId });

  return (
    <>
      <PageContainer size="list">
        <BackLink href="/dashboard" label="← Kembali ke Dashboard" />
        <PageHeader
          title="Periode Buku"
          subtitle="Tutup periode untuk mengunci jurnal sebelum tanggal cutoff. Buka kembali hanya boleh untuk periode terakhir yang ditutup."
          actions={
            <a href="/proxy/periods/export.xlsx" className={buttonClass('success')}>
              Export Excel
            </a>
          }
        />

        {error && (
          <StatusBanner tone="danger" className="mb-6">
            <span><strong>Gagal: </strong>{error}</span>
          </StatusBanner>
        )}

        {canAdmin(s.role) && (
          <Card className="mb-6">
            <div className="text-sm font-bold text-tanah-700 mb-3">Tambah Tahun Buku</div>
            <form action={createFiscalYearAction} className="flex items-end gap-3">
              <FormField label="Kode">
                <Input name="kode" required placeholder="mis. 2027" fullWidth={false} className="w-32" />
              </FormField>
              <FormField label="Bulan Mulai">
                <Input type="month" name="startDate" required fullWidth={false} />
              </FormField>
              <Button type="submit">Tambah Tahun Buku</Button>
            </form>
            <p className="text-xs text-tanah-500 mt-2">
              12 periode bulanan otomatis dibuat berturut-turut dari bulan mulai — bisa untuk
              tahun mendatang (mis. 2027) atau data historis (mis. 2024/2025).
            </p>
          </Card>
        )}

        {years.map((y) => {
          const last = y.periods[y.periods.length - 1];
          const canCloseYear =
            y.status === 'OPEN' &&
            !!last &&
            last.status === 'OPEN' &&
            y.periods.slice(0, -1).every((p) => p.status === 'CLOSED');
          return (
          <Card key={y.id} padding="none" className="mb-6 overflow-hidden">
            <div className="px-5 py-3 bg-cream-50 border-b border-cream-200 flex items-center justify-between">
              <div>
                <div className="font-display text-xl font-semibold text-wedel-900">
                  Tahun Buku {y.kode}
                </div>
                <div className="text-xs text-tanah-500">
                  {fmtTanggal(y.startDate)} — {fmtTanggal(y.endDate)} ·{' '}
                  <span
                    className={
                      y.status === 'CLOSED'
                        ? 'text-bata-700 font-bold'
                        : 'text-padi-700 font-bold'
                    }
                  >
                    {y.status}
                  </span>
                </div>
              </div>
              <div>
                {canCloseYear && (
                  <form action={closeYearAction} className="inline-flex items-center gap-1">
                    <input type="hidden" name="fiscalYearId" value={y.id} />
                    <input
                      type="text"
                      name="catatan"
                      placeholder="Catatan tutup tahun (opsional)"
                      className="px-2 py-1 text-xs border border-cream-300 rounded bg-white w-52"
                    />
                    <Button type="submit" variant="danger" size="sm">Tutup Tahun Buku</Button>
                  </form>
                )}
                {y.status === 'CLOSED' && (
                  <form action={reopenYearAction} className="inline-flex items-center gap-1">
                    <input type="hidden" name="fiscalYearId" value={y.id} />
                    <input
                      type="text"
                      name="alasan"
                      required
                      placeholder="Alasan buka tahun buku…"
                      className="px-2 py-1 text-xs border border-cream-300 rounded bg-white w-52"
                    />
                    <Button type="submit" variant="secondary" size="sm">Buka Tahun Buku</Button>
                  </form>
                )}
              </div>
            </div>

            <table className="w-full text-sm">
              <THead>
                <TH className="w-8">No</TH>
                <TH>Periode</TH>
                <TH>Rentang</TH>
                <TH>Status</TH>
                <TH numeric>Aksi</TH>
              </THead>
              <TBody>
                {y.periods.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-tanah-500 tabular-nums">
                      {p.no.toString().padStart(2, '0')}
                    </TD>
                    <TD className="font-semibold text-tanah-700">{p.label}</TD>
                    <TD className="text-xs text-tanah-500">
                      {fmtTanggal(p.startDate)} — {fmtTanggal(p.endDate)}
                    </TD>
                    <TD>
                      <PeriodStatus status={p.status} />
                      {p.closedAt && (
                        <div className="text-[10px] text-tanah-500 mt-0.5">
                          Ditutup {fmtTanggal(p.closedAt)}
                        </div>
                      )}
                    </TD>
                    <TD className="text-right">
                      {p.status === 'OPEN' && (
                        <form action={closePeriodAction} className="inline-flex items-center gap-1">
                          <input type="hidden" name="periodId" value={p.id} />
                          <input
                            type="text"
                            name="catatan"
                            placeholder="Catatan tutup (opsional)"
                            className="px-2 py-1 text-xs border border-cream-300 rounded bg-cream-50 w-44"
                          />
                          <Button type="submit" variant="danger" size="sm">Tutup</Button>
                        </form>
                      )}
                      {p.status === 'CLOSED' && (
                        <form action={reopenPeriodAction} className="inline-flex items-center gap-1">
                          <input type="hidden" name="periodId" value={p.id} />
                          <input
                            type="text"
                            name="alasan"
                            required
                            placeholder="Alasan reopen…"
                            className="px-2 py-1 text-xs border border-cream-300 rounded bg-cream-50 w-44"
                          />
                          <Button type="submit" variant="secondary" size="sm">Buka</Button>
                        </form>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </table>
          </Card>
          );
        })}
      </PageContainer>
    </>
  );
}

function PeriodStatus({ status }: { status: PeriodRow['status'] }) {
  const variant: BadgeVariant = {
    OPEN: 'success',
    CLOSING: 'warning',
    CLOSED: 'neutral',
  }[status] as BadgeVariant;
  return <Badge variant={variant}>{status}</Badge>;
}
