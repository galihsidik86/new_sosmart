/*
 * Lentera PWA service worker — KONSERVATIF (aplikasi keuangan ber-otentikasi).
 *  - Cache HANYA aset statis immutable (/_next/static, /icons, ikon, manifest, font).
 *  - Navigasi halaman: network-first; saat OFFLINE tampilkan halaman offline
 *    (BUKAN halaman/data lama) → tak ada risiko menampilkan data keuangan basi.
 *  - TIDAK pernah menyentuh POST maupun respons API/laporan (RSC/GET /proxy)
 *    → tidak ada data sensitif tersimpan di perangkat.
 *  Naikkan versi cache (v1 → v2) bila ingin memaksa pembersihan cache lama.
 */
const STATIC_CACHE = 'lentera-static-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.add(OFFLINE_URL);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  const p = url.pathname;
  return (
    p.startsWith('/_next/static/') ||
    p.startsWith('/icons/') ||
    p === '/manifest.webmanifest' ||
    /\/(icon|apple-icon|favicon)[^/]*$/.test(p) ||
    /\.(?:png|jpg|jpeg|svg|ico|woff2?)$/.test(p)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // jangan pernah intersep POST/login/mutasi
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // hanya same-origin

  // Aset statis immutable → cache-first (cepat, hemat kuota, aman: konten ber-hash)
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok && res.type === 'basic') {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Navigasi halaman → SELALU network-first; offline → halaman offline
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch (e) {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return offline || Response.error();
        }
      })(),
    );
    return;
  }
  // Sisanya (RSC, GET /proxy data, dll) dibiarkan ke jaringan default — tidak di-cache.
});
