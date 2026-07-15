#!/usr/bin/env bash
# =============================================================================
# Lentera — backup harian (versioned di repo, dijalankan di server via cron).
#
# Meng-backup 4 hal yang TIDAK ada di git:
#   1. Database  → pg_dump -Fc (schema + data + RLS policies + grants)
#   2. Globals   → pg_dumpall --globals-only (roles incl. lentera_app + password)
#   3. Uploads   → apps/api/uploads (branding.json + logos)
#   4. Secrets   → .env (perms 600)
#
# Kode ada di GitHub (origin) — itu "backup"-nya sendiri, tidak perlu di sini.
# Redis = cache murni (rebuildable) — sengaja TIDAK di-backup.
#
# Env opsional:
#   LENTERA_BACKUP_DIR             (default /srv/lentera/backups)
#   LENTERA_BACKUP_RETENTION_DAYS  (default 14)
#   LENTERA_OFFSITE_TARGET         rclone/rsync remote — WAJIB untuk DR nyata.
#
# Exit non-zero kalau ada langkah gagal (cron akan alert lewat MAILTO / log).
# =============================================================================
set -euo pipefail

ROOT="/srv/lentera"
BACKUP_DIR="${LENTERA_BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${LENTERA_BACKUP_RETENTION_DAYS:-14}"
CONTAINER="lentera_prod_postgres"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"/{db,globals,uploads,secrets}

# Kredensial superuser dari .env (untuk dump penuh, bypass RLS).
set -a; source "$ROOT/.env"; set +a
PGUSER="${POSTGRES_USER:-lentera}"
PGDB="${POSTGRES_DB:-lentera}"
PGPW="$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$DATABASE_URL")"

DB_FILE="$BACKUP_DIR/db/lentera-$TS.dump"
GLOB_FILE="$BACKUP_DIR/globals/globals-$TS.sql"
UP_FILE="$BACKUP_DIR/uploads/uploads-$TS.tar.gz"
ENV_FILE="$BACKUP_DIR/secrets/env-$TS.bak"

echo "$(date -Is) START backup $TS"

# 1. Database — custom format (kompres + restore selektif).
docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
  pg_dump -U "$PGUSER" -d "$PGDB" -Fc > "$DB_FILE"

# 2. Globals (roles + password) — supaya restore mandiri di cluster fresh.
docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
  pg_dumpall -U "$PGUSER" --globals-only > "$GLOB_FILE"

# 3. Uploads (runtime, tidak di git).
tar -czf "$UP_FILE" -C "$ROOT/apps/api" uploads

# 4. Secrets (.env) — perms ketat. WAJIB ikut OFFSITE, terenkripsi.
cp "$ROOT/.env" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# Verifikasi dump bisa dibaca (integritas) — kalau korup, gagal di sini.
docker exec -i "$CONTAINER" pg_restore --list < "$DB_FILE" >/dev/null

# Retensi lokal.
for d in db globals uploads secrets; do
  find "$BACKUP_DIR/$d" -type f -mtime +"$RETENTION_DAYS" -delete
done

# Offsite — kritis untuk DR (lokal saja tidak tahan kehilangan server/disk).
if [[ -n "${LENTERA_OFFSITE_TARGET:-}" ]]; then
  if command -v rclone >/dev/null; then
    rclone copy "$BACKUP_DIR" "$LENTERA_OFFSITE_TARGET" --max-age 26h
  else
    rsync -a "$BACKUP_DIR/" "$LENTERA_OFFSITE_TARGET/"
  fi
  echo "$(date -Is) OFFSITE pushed → $LENTERA_OFFSITE_TARGET"
else
  echo "$(date -Is) WARN: LENTERA_OFFSITE_TARGET belum di-set — backup HANYA lokal."
fi

echo "$(date -Is) DONE db=$(du -h "$DB_FILE" | cut -f1) globals=$(du -h "$GLOB_FILE" | cut -f1) uploads=$(du -h "$UP_FILE" | cut -f1)"
