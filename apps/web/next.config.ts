import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lentera/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
