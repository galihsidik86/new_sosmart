'use client';

import { useState, useTransition } from 'react';
import { fmtPlain } from '@/lib/format';
import type { BudgetViolation, PostResult } from '@/lib/budgetGuard';

interface Props {
  /** Label tombol utama (mis. "Post Jurnal" atau "Post (perlu approval Akuntan)"). */
  label: string;
  /** Kalau butuh step-up sebelum post (mis. KASIR post jurnal),
   *  set true — tombol utama akan langsung buka modal step-up. */
  requiresStepUpFirst?: boolean;
  /** Server action: post biasa. Return PostResult. */
  postAction: () => Promise<PostResult>;
  /** Server action: post dengan override budget + step-up approver. */
  overrideAction: (formData: FormData) => Promise<{ error?: string } | void>;
}

export function PostButton({
  label,
  requiresStepUpFirst,
  postAction,
  overrideAction,
}: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<BudgetViolation[] | null>(null);
  const [showStepUp, setShowStepUp] = useState<'first' | 'override' | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const tryPost = () => {
    setError(null);
    setViolations(null);
    start(async () => {
      const r = await postAction();
      if (r.ok) return; // page revalidated by server action
      if ('budgetViolations' in r) {
        setViolations(r.budgetViolations);
        setShowStepUp('override');
        return;
      }
      setError(r.error);
    });
  };

  const primaryClick = () => {
    if (requiresStepUpFirst) {
      setShowStepUp('first');
      return;
    }
    tryPost();
  };

  return (
    <>
      <button
        type="button"
        onClick={primaryClick}
        disabled={pending}
        className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm disabled:opacity-60"
      >
        {pending ? 'Memproses…' : label}
      </button>
      {error && (
        <span className="ml-2 text-xs text-bata-700 bg-bata-100 border border-bata-300 rounded-md px-2 py-1">
          {error}
        </span>
      )}

      {showStepUp && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowStepUp(null);
              setOverrideError(null);
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6">
            <h3 className="font-display text-xl font-semibold text-wedel-900 mb-1">
              {showStepUp === 'override'
                ? 'Override Budget Terlampaui'
                : 'Persetujuan Akuntan / Admin'}
            </h3>
            <p className="text-sm text-tanah-500 mb-3">
              {showStepUp === 'override' ? (
                <>
                  Posting ini menembus anggaran (budget). Wajib alasan + kredensial
                  <b> OWNER/ADMIN tenant</b> atau <b>MANAGER project</b> terkait.
                </>
              ) : (
                'Posting jurnal akan mengalokasi nomor permanen. Masukkan kredensial akuntan/admin untuk melanjutkan.'
              )}
            </p>

            {showStepUp === 'override' && violations && violations.length > 0 && (
              <div className="border border-bata-300 bg-bata-50 rounded-lg mb-4 max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-bata-100 text-bata-700 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-bold">Project</th>
                      <th className="px-2 py-1.5 text-left font-bold">Akun</th>
                      <th className="px-2 py-1.5 text-left font-bold">Periode</th>
                      <th className="px-2 py-1.5 text-right font-bold">Budget</th>
                      <th className="px-2 py-1.5 text-right font-bold">Terpakai</th>
                      <th className="px-2 py-1.5 text-right font-bold">Ditambah</th>
                      <th className="px-2 py-1.5 text-right font-bold">Proyeksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map((v) => (
                      <tr key={`${v.projectId}-${v.accountId}`} className="border-t border-bata-200">
                        <td className="px-2 py-1 font-mono text-tanah-700">
                          {v.projectKode}
                        </td>
                        <td className="px-2 py-1 font-mono text-tanah-700">
                          {v.accountKode}
                        </td>
                        <td className="px-2 py-1 text-tanah-500">{v.periode}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          {fmtPlain(v.budgetAmount)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          {fmtPlain(v.spentSoFar)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          {fmtPlain(v.newMutasi)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums text-bata-700 font-bold">
                          {fmtPlain(v.projectedTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form
              action={(formData) => {
                setOverrideError(null);
                start(async () => {
                  const r = await overrideAction(formData);
                  if (r?.error) setOverrideError(r.error);
                  else {
                    setShowStepUp(null);
                    setViolations(null);
                  }
                });
              }}
              className="space-y-3"
            >
              {showStepUp === 'override' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                    Alasan Override
                  </label>
                  <textarea
                    name="alasan"
                    required
                    minLength={5}
                    rows={2}
                    placeholder="Contoh: pengecualian atas persetujuan direksi karena…"
                    className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                  Email Approver
                </label>
                <input
                  name="approverEmail"
                  type="email"
                  required
                  autoComplete="off"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                  Password Approver
                </label>
                <input
                  name="approverPassword"
                  type="password"
                  required
                  autoComplete="off"
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
                />
              </div>

              <input
                type="hidden"
                name="overrideBudget"
                value={showStepUp === 'override' ? 'true' : 'false'}
              />

              {overrideError && (
                <div className="text-xs text-bata-700 bg-bata-100 border border-bata-300 rounded-md px-3 py-2">
                  {overrideError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStepUp(null);
                    setOverrideError(null);
                  }}
                  disabled={pending}
                  className="px-4 py-2 bg-cream-100 hover:bg-cream-200 text-tanah-700 font-semibold rounded-lg text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className={`px-4 py-2 text-cream-50 font-semibold rounded-lg text-sm disabled:opacity-60 ${
                    showStepUp === 'override'
                      ? 'bg-bata-500 hover:bg-bata-700'
                      : 'bg-sogan-500 hover:bg-sogan-600'
                  }`}
                >
                  {pending ? 'Memproses…' : 'Setujui'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
