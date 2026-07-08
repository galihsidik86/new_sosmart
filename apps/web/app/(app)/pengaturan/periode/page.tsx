import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtTanggal } from '@/lib/format';

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
      <Topbar breadcrumb="Periode Buku" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Periode Buku
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Tutup periode untuk mengunci jurnal sebelum tanggal cutoff.
              Buka kembali hanya boleh untuk periode terakhir yang ditutup.
            </p>
          </div>
          <a href="/proxy/periods/export.xlsx"
            className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700">
            Export Excel
          </a>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 mb-6">
            <strong>Gagal: </strong>{error}
          </div>
        )}

        {years.map((y) => {
          const last = y.periods[y.periods.length - 1];
          const canCloseYear =
            y.status === 'OPEN' &&
            !!last &&
            last.status === 'OPEN' &&
            y.periods.slice(0, -1).every((p) => p.status === 'CLOSED');
          return (
          <div
            key={y.id}
            className="bg-white rounded-xl border border-cream-200 shadow-sm mb-6 overflow-hidden"
          >
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
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-bata-500 hover:bg-bata-700 text-cream-50 text-xs font-bold rounded"
                    >
                      Tutup Tahun Buku
                    </button>
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
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-cream-200 hover:bg-cream-300 text-tanah-700 text-xs font-bold rounded border border-cream-400"
                    >
                      Buka Tahun Buku
                    </button>
                  </form>
                )}
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500 text-left">
                  <th className="px-4 py-2 font-bold w-8">No</th>
                  <th className="px-4 py-2 font-bold">Periode</th>
                  <th className="px-4 py-2 font-bold">Rentang</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                  <th className="px-4 py-2 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {y.periods.map((p) => (
                  <tr key={p.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2 font-mono text-tanah-500 tabular-nums">
                      {p.no.toString().padStart(2, '0')}
                    </td>
                    <td className="px-4 py-2 font-semibold text-tanah-700">{p.label}</td>
                    <td className="px-4 py-2 text-xs text-tanah-500">
                      {fmtTanggal(p.startDate)} — {fmtTanggal(p.endDate)}
                    </td>
                    <td className="px-4 py-2">
                      <PeriodStatus status={p.status} />
                      {p.closedAt && (
                        <div className="text-[10px] text-tanah-400 mt-0.5">
                          Ditutup {fmtTanggal(p.closedAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.status === 'OPEN' && (
                        <form action={closePeriodAction} className="inline-flex items-center gap-1">
                          <input type="hidden" name="periodId" value={p.id} />
                          <input
                            type="text"
                            name="catatan"
                            placeholder="Catatan tutup (opsional)"
                            className="px-2 py-1 text-xs border border-cream-300 rounded bg-cream-50 w-44"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1 bg-bata-500 hover:bg-bata-700 text-cream-50 text-xs font-semibold rounded"
                          >
                            Tutup
                          </button>
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
                          <button
                            type="submit"
                            className="px-2.5 py-1 bg-cream-200 hover:bg-cream-300 text-tanah-700 text-xs font-semibold rounded border border-cream-400"
                          >
                            Buka
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          );
        })}
      </div>
    </>
  );
}

function PeriodStatus({ status }: { status: PeriodRow['status'] }) {
  const map = {
    OPEN: { bg: 'bg-padi-100', text: 'text-padi-700', label: 'OPEN' },
    CLOSING: { bg: 'bg-emas-100', text: 'text-emas-700', label: 'CLOSING' },
    CLOSED: { bg: 'bg-cream-200', text: 'text-tanah-500', label: 'CLOSED' },
  }[status];
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${map.bg} ${map.text}`}
    >
      {map.label}
    </span>
  );
}
