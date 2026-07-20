#!/usr/bin/env bash
#
# Deploy web BLUE-GREEN (zero-downtime, isolasi penuh).
#
# Dua "warna" web bergantian:
#   lentera-web-a → port 3011, serve apps/web/.next-a
#   lentera-web-b → port 3012, serve apps/web/.next-b
# Hanya satu aktif (di-tunjuk Caddy). Deploy: build ke warna INAKTIF → start →
# health-check di port-nya → flip Caddy ke port itu + `systemctl reload caddy`
# (graceful, 0 request drop) → stop warna lama. `.next` warna aktif tak pernah
# disentuh; kalau build/health gagal, Caddy TIDAK di-flip (situs tetap warna lama).
#
# SUMBER TUNGGAL config PM2 = infra/ecosystem.config.cjs (ter-version-control).
# Deploy menyalinnya ke /srv/lentera/ecosystem.config.cjs tiap run, dan warna
# standby di-(re)start dari file itu supaya perubahan config ikut ter-apply.
# Karena warna standby tak melayani traffic, delete+start-nya tetap zero-downtime.
#
# CATATAN: `git pull` DI LAUNCHER, bukan di skrip ini — supaya skrip tak menimpa
# dirinya sendiri saat berjalan (self-modify footgun). Pakai (detached):
#   setsid bash -c 'cd /srv/lentera && { git pull --ff-only origin main && bash scripts/deploy-web-bg.sh; } > /tmp/deploy-web.log 2>&1; echo EXIT=$? >> /tmp/deploy-web.log' &
#
set -euo pipefail

ROOT="/srv/lentera"; WEB="$ROOT/apps/web"; STATE="$ROOT/.web-active"
CADDY="/etc/caddy/Caddyfile"
cd "$ROOT"

active="$(cat "$STATE" 2>/dev/null || echo a)"
if [ "$active" = "a" ]; then inactive=b; else inactive=a; fi
port_for(){ [ "$1" = "a" ] && echo 3011 || echo 3012; }
in_port="$(port_for "$inactive")"; act_port="$(port_for "$active")"
echo "==> aktif=$active(:$act_port) → deploy ke inaktif=$inactive(:$in_port)"

echo "==> [1/8] sync config PM2 dari sumber tunggal infra/ecosystem.config.cjs"
cp -f "$ROOT/infra/ecosystem.config.cjs" "$ROOT/ecosystem.config.cjs"
node -e "require('$ROOT/ecosystem.config.cjs')" # gagal-cepat kalau syntax rusak

echo "==> [2/8] env"
set -a; source "$ROOT/.env"; set +a
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:4002}"

echo "==> [3/8] build ke .next-$inactive (nice+ionice; warna aktif tak disentuh)"
rm -rf "$WEB/.next-$inactive"
NEXT_DIST_DIR=".next-$inactive" nice -n 15 ionice -c3 pnpm --filter @lentera/web build
if [ ! -f "$WEB/.next-$inactive/BUILD_ID" ]; then
  echo "!! BUILD GAGAL — abort. Warna aktif ($active) tetap melayani, Caddy tak disentuh."
  rm -rf "$WEB/.next-$inactive"; exit 1
fi
echo "    build OK (BUILD_ID=$(cat "$WEB/.next-$inactive/BUILD_ID"))"

echo "==> [4/8] (re)start lentera-web-$inactive dari ecosystem (:$in_port serve .next-$inactive)"
# delete+start dari file → config terbaru (port/env/backoff) ikut ter-apply.
# Warna standby tak melayani traffic, jadi ini zero-downtime.
unset NEXT_DIST_DIR
pm2 delete "lentera-web-$inactive" >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --only "lentera-web-$inactive"

echo "==> [5/8] health-check warna baru (:$in_port)"
ok=0
for i in $(seq 1 30); do
  c=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${in_port}/login" || echo 000)
  if [ "$c" = "200" ]; then ok=1; echo "    ready ($c) setelah ${i}s"; break; fi
  sleep 1
done
if [ "$ok" != "1" ]; then
  echo "!! warna baru tak sehat — abort, Caddy TIDAK di-flip. Warna aktif ($active) tetap melayani."
  pm2 stop "lentera-web-$inactive" >/dev/null 2>&1 || true; exit 1
fi

echo "==> [6/8] flip Caddy → :$in_port + reload (graceful)"
BK="${CADDY}.bak.$$"; cp "$CADDY" "$BK"
sed -i "s|reverse_proxy 127.0.0.1:[0-9]* # WEB-ACTIVE|reverse_proxy 127.0.0.1:${in_port} # WEB-ACTIVE|" "$CADDY"
if ! caddy validate --config "$CADDY" --adapter caddyfile >/dev/null 2>&1; then
  echo "!! Caddy config invalid — restore & abort"; cp "$BK" "$CADDY"; rm -f "$BK"; exit 1
fi
systemctl reload caddy

echo "==> [7/8] verifikasi situs live"
sleep 2
live=$(curl -s -o /dev/null -w "%{http_code}" https://lentera.sosmartpro.com/login --insecure || echo 000)
echo "    situs live = $live"
if [ "$live" != "200" ]; then
  echo "!! situs $live setelah flip — ROLLBACK: sed Caddy balik ke :$act_port + reload caddy; pm2 restart lentera-web-$active"
  exit 1
fi

echo "==> [8/8] stop warna lama (lentera-web-$active) + simpan state"
pm2 stop "lentera-web-$active" >/dev/null 2>&1 || true
echo "$inactive" > "$STATE"
pm2 save >/dev/null 2>&1
rm -f "$BK"
echo "==> SELESAI. Zero-downtime. Aktif sekarang = $inactive (:$in_port)."
