#!/usr/bin/env bash
# Full logical backup of the production database into ./backups/ (one file per run).
#
#   DIRECT_URL="<Neon direct (non-pooler) connection string>" bash scripts/backup-db.sh
#
# Needs `pg_dump` (PostgreSQL client tools) of the same or newer major version
# as the server. Restore into an empty database with:
#   pg_restore --no-owner --dbname "<url>" backups/ainabi-YYYY-MM-DD_HHMM.dump
set -euo pipefail

URL="${DIRECT_URL:-${DATABASE_URL:-}}"
if [ -z "$URL" ]; then
  echo "Set DIRECT_URL (preferred) or DATABASE_URL to the database to back up." >&2
  exit 1
fi
command -v pg_dump >/dev/null || { echo "pg_dump not found — install the PostgreSQL client tools." >&2; exit 1; }

mkdir -p backups
FILE="backups/ainabi-$(date +%Y-%m-%d_%H%M).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname "$URL" --file "$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the last 30 dumps.
ls -1t backups/ainabi-*.dump 2>/dev/null | tail -n +31 | xargs -r rm --
