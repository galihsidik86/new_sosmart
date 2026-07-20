import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lentera/shared'],
  // Deploy zero-downtime: build bisa diarahkan ke direktori staging lewat
  // NEXT_DIST_DIR (mis. `.next-build`), lalu di-swap atomik ke `.next`.
  // Default tetap `.next` untuk dev & `next start` produksi (env tak di-set).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    typedRoutes: true,
    // Server Action default 1 MB terlalu kecil untuk upload logo (API izinkan 2 MB).
    // Naikkan ke 4 MB supaya file logo lolos ke API; API tetap enforce batas 2 MB.
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default config;
