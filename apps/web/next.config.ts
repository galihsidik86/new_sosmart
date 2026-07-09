import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lentera/shared'],
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
