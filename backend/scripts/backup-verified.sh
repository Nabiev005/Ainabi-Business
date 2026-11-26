#!/usr/bin/env bash
# Dumps the database, proves the dump restores, then encrypts it.
# Run by .github/workflows/db-backup.yml every night; works locally too:
#
#   BACKUP_DATABASE_URL="<Neon direct (non-pooler) URL>" \
#   VERIFY_DATABASE_URL="<an EMPTY scratch database>" \
#   BACKUP_PASSPHRASE="<long secret>" bash scripts/backup-verified.sh
#
# Output: backups/ainabi-<UTC date>.dump.gpg (AES-256). Only the encrypted
# file is kept — the repository is public, so a plain dump must never leave
# this machine. Decrypt and restore: see DEPLOYMENT.md, "Бэкапты калыбына келтирүү".
set -euo pipefail

: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL}"
: "${VERIFY_DATABASE_URL:?Set VERIFY_DATABASE_URL (an empty scratch database)}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
if [ "${#BACKUP_PASSPHRASE}" -lt 20 ]; then
  echo "BACKUP_PASSPHRASE must be at least 20 characters." >&2
  exit 1
fi

out="${OUT_DIR:-backups}"
mkdir -p "$out"
stamp="$(date -u +%Y-%m-%d_%H%M)"
dump="$out/ainabi-$stamp.dump"
# The unencrypted dump is removed however the script ends.
trap 'rm -f "$dump"' EXIT

echo "Dumping…"
pg_dump --format=custom --no-owner --no-privileges --dbname "$BACKUP_DATABASE_URL" --file "$dump"

echo "Restoring into the scratch database to prove the dump works…"
# Hosted databases can carry extensions/settings a plain Postgres lacks, so
# pg_restore may warn; what matters is checked right after.
pg_restore --no-owner --no-privileges --dbname "$VERIFY_DATABASE_URL" "$dump" || echo "pg_restore reported warnings; checking the result."

q() { psql "$VERIFY_DATABASE_URL" --no-psqlrc -tAc "$1"; }
tables="$(q "select count(*) from information_schema.tables where table_schema = 'public'")"
migrations="$(q 'select count(*) from "_prisma_migrations" where finished_at is not null')"
businesses="$(q 'select count(*) from "businesses"')"
if [ "$tables" -lt 20 ] || [ "$migrations" -lt 1 ] || [ "$businesses" -lt 1 ]; then
  echo "Backup check FAILED: tables=$tables migrations=$migrations businesses=$businesses" >&2
  exit 1
fi
# Counts only, never data: CI logs of a public repo are public.
echo "Backup verified: $tables tables, $migrations migrations restored."

encrypted="$dump.gpg"
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --output "$encrypted" "$dump"
echo "Encrypted: $encrypted ($(du -h "$encrypted" | cut -f1))"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "file=$encrypted" >> "$GITHUB_OUTPUT"; fi
