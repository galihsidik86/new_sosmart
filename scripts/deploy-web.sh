#!/usr/bin/env bash
#
# Deploy web zero-downtime (staging swap).
#
# Masalah lama: `rm -rf .next && next build` menyentuh `.next` LIVE selama ~6
# menit. Kalau proses `next start` ke-restart di window itu, ia gagal
# `ENOENT .../.next/prerender-manifest.json` → PM2 crash-loop → CPU spike yang
# bahkan meng-crash aplikasi tetangga. Lihat memory `lentera-deploy-crashloop`.
#
# Solusi: build ke direktori STAGING (NEXT_DIST_DIR), lalu swap atomik ke
# `.next`. `.next` live tak pernah kosong selama build; downtime hanya ~2 dtk
# saat restart PM2 di akhir. Kalau build gagal, `.next` live sama sekali tak
# disentuh (deploy abort, situs tetap jalan).
#
# Pakai (di server):  cd /srv/lentera && bash scripts/deploy-web.sh
#
set -euo pipefail

ROOT="/srv/lentera"
WEB="$ROOT/apps/web"
PORT=3001
cd "$ROOT"

echo "==> [1/6] git pull"
git pull --ff-only origin main

echo "==> [2/6] load env"
set -a; source "$ROOT/.env"; set +a
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:4002}"

# Direktori staging unik per-run (PID) supaya tak bentrok kalau ada 2 deploy.
STAGING=".next-build-$$"
echo "==> [3/6] build ke staging: apps/web/$STAGING (live .next tidak disentuh)"
rm -rf "$WEB/$STAGING"
NEXT_DIST_DIR="$STAGING" pnpm --filter @lentera/web build

if [ ! -f "$WEB/$STAGING/BUILD_ID" ]; then
  echo "!! BUILD GAGAL (tak ada BUILD_ID). Live .next TIDAK disentuh — situs tetap jalan."
  rm -rf "$WEB/$STAGING"
  exit 1
fi
echo "    build OK (BUILD_ID=$(cat "$WEB/$STAGING/BUILD_ID"))"

echo "==> [4/6] swap atomik .next"
cd "$WEB"
rm -rf .next-old
[ -e .next ] && mv .next .next-old
mv "$STAGING" .next
cd "$ROOT"

echo "==> [5/6] restart lentera-web (TANPA --update-env agar NEXT_DIST_DIR tak bocor ke runtime)"
unset NEXT_DIST_DIR
pm2 restart lentera-web

sleep 3
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/login" || echo 000)
echo "==> [6/6] health check: HTTP $code"

if [ "$code" = "200" ]; then
  rm -rf "$WEB/.next-old"
  echo "==> SELESAI. Deploy sukses, .next-old dibersihkan."
else
  echo "!! HTTP $code — kemungkinan build baru bermasalah."
  echo "   ROLLBACK cepat:"
  echo "     cd $WEB && rm -rf .next && mv .next-old .next && cd $ROOT && pm2 restart lentera-web"
  exit 1
fi
