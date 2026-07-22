'use client';

import { useEffect, useState } from 'react';

/**
 * Banner "Instal Aplikasi" (PWA). Muncul otomatis saat browser siap meng-install
 * (Android/Chrome/Edge via `beforeinstallprompt`). Untuk iOS Safari yang tak
 * punya prompt otomatis, tombol menampilkan instruksi "Bagikan → Tambah ke Layar
 * Utama". Sembunyi kalau sudah ter-install (standalone) atau baru saja ditutup
 * (snooze 14 hari). Non-intrusif & bisa ditutup.
 */
const SNOOZE_KEY = 'lentera-install-snooze';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    if (standalone) return; // sudah ter-install → jangan tampilkan

    try {
      const s = Number(localStorage.getItem(SNOOZE_KEY) || '0');
      if (s && Date.now() < s + SNOOZE_MS) return; // masih dalam masa snooze
    } catch {
      /* localStorage bisa diblokir — abaikan */
    }

    const ua = navigator.userAgent;
    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    const onBIP = (e: Event) => {
      e.preventDefault(); // cegah mini-infobar bawaan; kita pakai tombol sendiri
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    // iOS tak memicu beforeinstallprompt → tampilkan tombol bantuan (jeda kecil).
    let t: ReturnType<typeof setTimeout> | undefined;
    if (ios) t = setTimeout(() => setShow(true), 1500);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      /* abaikan */
    }
    setShow(false);
    setIosHelp(false);
  };

  const onInstall = async () => {
    if (isIOS && !deferred) {
      setIosHelp((v) => !v);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* abaikan */
    }
    setDeferred(null);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-3 pointer-events-none"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-cream-300 bg-white shadow-lg animate-lent-fade overflow-hidden">
        <div className="flex items-center gap-3 p-3">
          <img
            src="/icons/icon-192.png"
            alt="Lentera"
            width={44}
            height={44}
            className="h-11 w-11 flex-none rounded-xl shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-tanah-700 leading-tight">
              Instal Lentera di perangkat ini
            </p>
            <p className="text-xs text-tanah-500 leading-snug">
              Buka cepat dari layar utama, tampil penuh seperti aplikasi.
            </p>
          </div>
          <button
            type="button"
            onClick={onInstall}
            className="flex-none rounded-lg bg-sogan-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sogan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sogan-500/40"
          >
            {isIOS ? 'Cara Instal' : 'Instal'}
          </button>
          <button
            type="button"
            onClick={snooze}
            aria-label="Tutup"
            className="flex-none rounded-lg p-1.5 text-tanah-500 hover:bg-cream-100 hover:text-tanah-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {isIOS && iosHelp && (
          <div className="border-t border-cream-200 bg-cream-50 px-4 py-3 text-xs text-tanah-700">
            <p className="font-semibold mb-1">Di Safari:</p>
            <ol className="list-decimal pl-4 space-y-1 text-tanah-600">
              <li>
                Ketuk tombol{' '}
                <span className="inline-flex items-center gap-1 font-semibold text-sogan-500">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
                    <path d="M12 16V4M8 8l4-4 4 4" />
                    <path d="M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
                  </svg>
                  Bagikan
                </span>{' '}
                di bilah bawah.
              </li>
              <li>Pilih <b>“Tambah ke Layar Utama”</b>.</li>
              <li>Ketuk <b>Tambah</b> — ikon Lentera muncul di layar utama.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
