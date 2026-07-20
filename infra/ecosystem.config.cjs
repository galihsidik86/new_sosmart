// PM2 ecosystem — Lentera (blue-green web).
//
// Web dijalankan sebagai DUA "warna" yang bergantian tiap deploy:
//   lentera-web-a  → port 3011, serve dari apps/web/.next-a
//   lentera-web-b  → port 3012, serve dari apps/web/.next-b
// Hanya SATU yang aktif (di-tunjuk Caddy) pada satu waktu; yang lain di-stop.
// Deploy (scripts/deploy-web-bg.sh): build ke warna inaktif → start → health
// check → flip Caddy + reload (graceful) → stop warna lama. Zero-downtime.
//
// distDir dipilih lewat NEXT_DIST_DIR (lihat apps/web/next.config.ts).
// Restart safety (backoff + batas) supaya crash-loop tak menghajar CPU.

const webCommon = {
  cwd: '/srv/lentera/apps/web',
  script: 'node_modules/next/dist/bin/next',
  min_uptime: '20s',
  max_restarts: 8,
  exp_backoff_restart_delay: 500,
};

module.exports = {
  apps: [
    {
      name: 'lentera-api',
      cwd: '/srv/lentera/apps/api',
      script: 'dist/main.js',
      min_uptime: '20s',
      max_restarts: 10,
      exp_backoff_restart_delay: 500,
      env: {
        NODE_ENV: 'production',
        API_PORT: process.env.API_PORT,
        DATABASE_URL: process.env.DATABASE_URL,
        APP_DATABASE_URL: process.env.APP_DATABASE_URL,
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
        JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL,
        JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL,
      },
    },
    {
      ...webCommon,
      name: 'lentera-web-a',
      args: 'start -p 3011',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_DIST_DIR: '.next-a',
      },
    },
    {
      ...webCommon,
      name: 'lentera-web-b',
      args: 'start -p 3012',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_DIST_DIR: '.next-b',
      },
    },
  ],
};
