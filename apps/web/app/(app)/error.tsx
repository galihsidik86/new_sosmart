'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonClass } from '@/components/ui';

/**
 * Error boundary untuk area aplikasi. Menangkap error render maupun error
 * Server Action (mis. validasi API yang gagal) supaya tidak muncul layar
 * "Application error" mentah — melainkan kartu ramah dengan opsi coba lagi.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[70vh] grid place-items-center p-6">
      <div className="max-w-md w-full bg-white border border-cream-200 rounded-2xl shadow-md p-7 text-center">
        <div className="w-12 h-12 rounded-full bg-bata-100 text-bata-700 grid place-items-center mx-auto mb-4 text-2xl">
          !
        </div>
        <h1 className="font-display text-xl font-semibold text-tanah-700 mb-1">
          Terjadi kesalahan
        </h1>
        <p className="text-sm text-tanah-500 mb-5">
          Permintaan tidak dapat diproses. Ini biasanya karena data yang diisi
          belum valid (mis. format NPWP harus 15/16 digit, kode sudah dipakai,
          atau ada isian wajib yang kosong). Periksa kembali isian Anda lalu
          coba lagi.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => reset()}>Coba lagi</Button>
          <Link href="/dashboard" className={buttonClass('secondary')}>
            Ke Dashboard
          </Link>
        </div>
        {error?.digest && (
          <p className="text-[11px] text-tanah-400 mt-4 font-mono">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
