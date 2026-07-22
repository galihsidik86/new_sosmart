import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — membuat Lentera bisa di-install ke home screen HP/tablet
 * (standalone, ikon brand, splash). Next.js menyajikannya di
 * `/manifest.webmanifest` dan menyisipkan <link rel="manifest"> otomatis.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lentera — Akuntansi & Pajak',
    short_name: 'Lentera',
    description:
      'Sistem akuntansi & pajak Indonesia — multi-perusahaan, multi-cabang, laporan real-time.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F5F1E8', // cream (splash)
    theme_color: '#8B2E2E', // sogan/maroon (bilah status)
    lang: 'id',
    dir: 'ltr',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard' },
      { name: 'Penjualan', url: '/transaksi/penjualan' },
      { name: 'Laporan Keuangan', url: '/laporan/neraca' },
    ],
  };
}
