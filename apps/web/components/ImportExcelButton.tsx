'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

interface Props {
  /** Server Action: receive FormData with `file` field, POST to API, return result. */
  importAction: (formData: FormData) => Promise<ImportResult>;
  /** Caption for tombol — default "Import Excel". */
  label?: string;
}

/**
 * Pasangan tombol Export Excel — pakai hidden file input. Saat file dipilih,
 * langsung trigger Server Action upload. Hasil ditampilkan inline (created /
 * skipped / errors per baris).
 */
export function ImportExcelButton({ importAction, label = 'Import Excel' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const router = useRouter();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await importAction(fd);
        setResult(r);
        router.refresh();
      } catch (err) {
        setResult({
          created: 0, skipped: 0,
          errors: [{ row: 0, message: err instanceof Error ? err.message : String(err) }],
        });
      } finally {
        if (inputRef.current) inputRef.current.value = '';
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="px-3 py-2 bg-sogan-50 hover:bg-sogan-100 border border-sogan-300 rounded-lg text-sm font-semibold text-sogan-700 disabled:opacity-50"
      >
        {pending ? 'Mengimpor…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={onFileChange}
      />
      {result && (
        <div
          className={`fixed bottom-6 right-6 max-w-sm bg-white border shadow-lg rounded-xl p-4 text-sm z-50 ${
            result.errors.length ? 'border-bata-300' : 'border-padi-300'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-tanah-700">
                {result.created} dibuat
                {result.skipped > 0 && <span className="text-bata-700"> · {result.skipped} dilewati</span>}
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs text-bata-700 mt-2 max-h-40 overflow-y-auto">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <div key={i}>
                      Baris {e.row}: {e.message}
                    </div>
                  ))}
                  {result.errors.length > 10 && (
                    <div className="italic">… {result.errors.length - 10} error lain</div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setResult(null)}
              className="text-tanah-400 hover:text-tanah-700"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}
