#!/usr/bin/env bash
# =============================================================================
# Lentera — restore database dari dump `pg_dump -Fc` (dibuat backup.sh).
#
# PENGGUNAAN:
#   restore.sh <dump-file> [target-db]
#
#   target-db default = "lentera_restore_test"  → AMAN, tidak menyentuh prod.
#   Untuk menimpa PRODUKSI: target-db = nama DB prod DAN env CONFIRM_PROD=yes.
#     CONFIRM_PROD=yes restore.sh backups/db/lentera-XXXX.dump lentera
#
# Restore ke DB scratch di cluster yang sama dipakai untuk:
#   - verifikasi backup bisa di-restore (uji rutin), dan
#   - inspeksi data lama tanpa mengganggu produksi.
# =============================================================================
set -euo pipefail

ROOT="/srv/lentera"
CONTAINER="lentera_prod_postgres"
DUMP="${1:?Usage: restore.sh <dump-file> [target-db]}"

set -a; source "$ROOT/.env"; set +a
PGUSER="${POSTGRES_USER:-lentera}"
PROD_DB="${POSTGRES_DB:-lentera}"
PGPW="$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$DATABASE_URL")"
TARGET="${2:-lentera_restore_test}"

if [[ "$TARGET" == "$PROD_DB" && "${CONFIRM_PROD:-}" != "yes" ]]; then
  echo "MENOLAK: target = DB PRODUKSI ($PROD_DB)."
  echo "Set CONFIRM_PROD=yes kalau memang sengaja menimpa produksi."
  exit 1
fi

[[ -f "$DUMP" ]] || { echo "Dump tidak ditemukan: $DUMP"; exit 1; }

echo "Restore '$DUMP' → DB '$TARGET' (container $CONTAINER)"

# (Re)create target DB.
docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$TARGET\";" \
  -c "CREATE DATABASE \"$TARGET\";"

# Restore. --no-owner: hindari error kalau role pemilik beda; grants & RLS
# policies tetap ter-restore (butuh role lentera_app sudah ada di cluster —
# di cluster fresh, jalankan globals-*.sql dulu; lihat DR-RUNBOOK.md).
docker exec -i -e PGPASSWORD="$PGPW" "$CONTAINER" \
  pg_restore -U "$PGUSER" -d "$TARGET" --no-owner --exit-on-error < "$DUMP"

echo "Selesai. Cek cepat:"
echo "  docker exec -e PGPASSWORD=... $CONTAINER psql -U $PGUSER -d $TARGET -c '\\dt' "
