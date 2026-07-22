'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

/**
 * Auto-refresh data halaman (server component) tanpa reload manual.
 *
 * Memanggil `router.refresh()` tiap `intervalMs` → Next menjalankan ulang
 * komponen server rute ini & React merekonsiliasi DOM (hanya bagian yang
 * berubah ter-update; posisi scroll & state klien tetap). Cocok untuk
 * halaman TAMPILAN/STATUS/DAFTAR — mis. status dokumen berubah jadi
 * "Disetujui" begitu approver menyetujui, tanpa refresh manual.
 *
 * JANGAN dipasang di halaman FORM input (buat/edit) — refresh bisa
 * mengganggu ketikan yang sedang berjalan.
 *
 * Hemat: dilewati saat tab tak terlihat, dan langsung refresh begitu user
 * kembali ke tab / fokus. `enabled=false` mematikan (mis. status sudah final).
 */
export function LiveRefresh({
  intervalMs = 8000,
  enabled = true,
}: {
  intervalMs?: number;
  enabled?: boolean;
}) {
  const router = useRouter();

  const refresh = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(refresh, Math.max(3000, intervalMs));
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, intervalMs, refresh]);

  return null;
}
