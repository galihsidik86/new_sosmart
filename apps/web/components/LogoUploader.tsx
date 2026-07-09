'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  /** Server Action: receive FormData with `file` field, upload ke API, return logo terbaru. */
  uploadAction: (formData: FormData) => Promise<{ logoUrl: string | null }>;
  /** Caption tombol — default "Ganti Logo" / "Unggah Logo". */
  label?: string;
}

/**
 * Tombol upload logo perusahaan — pola sama seperti `ImportExcelButton`,
 * hidden file input + langsung trigger Server Action saat file dipilih.
 */
export function LogoUploader({ uploadAction, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setError(null);
    startTransition(async () => {
      try {
        await uploadAction(fd);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (inputRef.current) inputRef.current.value = '';
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="px-3 py-2 bg-sogan-50 hover:bg-sogan-100 border border-sogan-300 rounded-lg text-sm font-semibold text-sogan-700 disabled:opacity-50"
      >
        {pending ? 'Mengunggah…' : (label ?? 'Ganti Logo')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFileChange}
      />
      {error && <p className="text-xs text-bata-700 mt-1.5">{error}</p>}
    </div>
  );
}
