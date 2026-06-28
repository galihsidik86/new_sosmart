'use client';

import { useEffect, useState, useTransition } from 'react';

interface AccountOpt {
  id: string;
  kode: string;
  nama: string;
}

interface Props {
  configKey: string;
  defaultKode: string;
  /** accountId terkini dari server (null = pakai default). */
  serverValue: string | null;
  /** Daftar akun postable untuk dropdown. */
  options: AccountOpt[];
  /** Server Action: terima FormData { key, accountId }, return void. */
  action: (formData: FormData) => Promise<void>;
}

/**
 * Per-row form controlled — `value` state sync ke `serverValue` setiap kali
 * re-render setelah Server Action selesai (lewat useEffect). Dengan controlled
 * select, perubahan dropdown selalu nge-update state, dan tombol Simpan
 * pakai useTransition sehingga ada visual feedback "Menyimpan…".
 */
export function GlConfigRow({ configKey, defaultKode, serverValue, options, action }: Props) {
  const [value, setValue] = useState(serverValue ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Re-sync ke serverValue terbaru setelah revalidate.
  useEffect(() => {
    setValue(serverValue ?? '');
  }, [serverValue]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.append('key', configKey);
    fd.append('accountId', value);
    startTransition(async () => {
      try {
        await action(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const dirty = value !== (serverValue ?? '');

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className="flex-1 px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm"
      >
        <option value="">— pakai default ({defaultKode}) —</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.kode} — {a.nama}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !dirty}
        className="px-3 py-1.5 bg-sogan-500 hover:bg-sogan-600 disabled:bg-cream-400 disabled:cursor-not-allowed text-cream-50 rounded-md text-xs font-semibold"
      >
        {pending ? 'Menyimpan…' : 'Simpan'}
      </button>
      {error && (
        <span className="text-xs text-bata-700" title={error}>
          ⚠
        </span>
      )}
    </form>
  );
}
