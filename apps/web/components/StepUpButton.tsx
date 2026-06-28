'use client';

import { useState, useTransition } from 'react';

interface StepUpButtonProps {
  label: string;
  title: string;
  description: string;
  /** Server action — receives FormData yang sudah berisi email+password+payload tersembunyi. */
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  /** Field hidden tambahan yang akan disertakan ke FormData saat submit. */
  hiddenFields?: Record<string, string>;
}

export function StepUpButton({
  label,
  title,
  description,
  action,
  hiddenFields,
}: StepUpButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
        className="px-4 py-2 bg-emas-100 hover:bg-emas-200 text-emas-700 font-semibold rounded-lg text-sm border border-emas-300"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h3 className="font-display text-xl font-semibold text-wedel-900 mb-1">
              {title}
            </h3>
            <p className="text-sm text-tanah-500 mb-4">{description}</p>

            <form
              action={(formData) => {
                if (hiddenFields) {
                  for (const [k, v] of Object.entries(hiddenFields)) {
                    formData.set(k, v);
                  }
                }
                start(async () => {
                  const r = await action(formData);
                  if (r?.error) setError(r.error);
                  else setOpen(false);
                });
              }}
              className="space-y-3"
            >
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

              {error && (
                <div className="text-xs text-bata-700 bg-bata-100 border border-bata-300 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="px-4 py-2 bg-cream-100 hover:bg-cream-200 text-tanah-700 font-semibold rounded-lg text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm disabled:opacity-60"
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
