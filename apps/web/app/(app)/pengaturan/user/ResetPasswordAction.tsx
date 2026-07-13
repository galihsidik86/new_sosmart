'use client';

import { useState, useTransition } from 'react';

/**
 * Reset password cepat dari daftar user. Admin klik → server generate password
 * sementara → tampil sekali supaya bisa disalin & diberikan ke user yang lupa
 * password. Tanpa email (Opsi A). Password lama langsung tidak berlaku.
 */
export function ResetPasswordAction({
  userId,
  action,
}: {
  userId: string;
  action: (userId: string) => Promise<string>;
}) {
  const [pending, startTransition] = useTransition();
  const [pw, setPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  if (pw) {
    return (
      <span className="inline-flex items-center gap-2 mt-1">
        <code className="px-2 py-0.5 rounded bg-emas-100 border border-emas-300 text-emas-700 font-mono text-xs select-all">
          {pw}
        </code>
        <button
          type="button"
          className="text-xs text-sogan-500 font-semibold hover:underline"
          onClick={() => {
            navigator.clipboard?.writeText(pw).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'tersalin' : 'salin'}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-tanah-500 font-semibold hover:text-sogan-500 hover:underline disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          setError(false);
          try {
            setPw(await action(userId));
          } catch {
            setError(true);
          }
        })
      }
    >
      {pending ? 'Mereset…' : error ? 'Gagal — ulangi' : 'Reset password'}
    </button>
  );
}
