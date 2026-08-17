#!/usr/bin/env bash

set -Eeuo pipefail

BACKUP_DIR=/var/backups/turntable
TIMESTAMP=$(date --utc +%Y%m%dT%H%M%SZ)
BACKUP_FILE="${BACKUP_DIR}/turntable-${TIMESTAMP}.dump"

umask 077
pg_dump --dbname="${DATABASE_URL:?DATABASE_URL is required}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_FILE}"

# Verify that pg_restore can read the archive before considering it successful.
pg_restore --list "${BACKUP_FILE}" >/dev/null

# Keep 30 days of daily backups.
find "${BACKUP_DIR}" -type f -name 'turntable-*.dump' -mtime +30 -delete
