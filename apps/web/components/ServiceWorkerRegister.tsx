'use client';

import { useEffect } from 'react';

/**
 * Mendaftarkan service worker PWA (/sw.js) di sisi klien, setelah halaman
 * selesai load agar tak mengganggu waktu muat pertama. Diam-diam gagal kalau
 * browser tak mendukung. Render null (tak ada UI).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* abaikan — PWA opsional, app tetap jalan tanpa SW */
      });
    };
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);
  return null;
}
