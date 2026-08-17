#!/usr/bin/env bash

set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo ./scripts/test-backup-restore.sh" >&2
  exit 1
fi

WEBSITE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
APP_USER=${SUDO_USER:-$(stat -c '%U' "${WEBSITE_DIR}")}
BACKUP_DIR=/var/backups/turntable
RESTORE_DATABASE=turntable_restore_test

DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' "${WEBSITE_DIR}/.env.local" | head -n 1)
if [[ -z ${DATABASE_URL} ]]; then
  echo "DATABASE_URL is missing from ${WEBSITE_DIR}/.env.local." >&2
  exit 1
fi

LATEST_BACKUP=$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'turntable-*.dump' -printf '%T@ %p\n' \
  | sort -nr \
  | head -n 1 \
  | cut -d' ' -f2-)

if [[ -z ${LATEST_BACKUP} ]]; then
  echo "No Turntable backup was found in ${BACKUP_DIR}." >&2
  exit 1
fi

RESTORE_URL="${DATABASE_URL%/*}/${RESTORE_DATABASE}"

cleanup() {
  sudo -u postgres dropdb --if-exists "${RESTORE_DATABASE}" >/dev/null
}
trap cleanup EXIT

cleanup
sudo -u postgres createdb --owner=turntable "${RESTORE_DATABASE}"
sudo -u "${APP_USER}" pg_restore --dbname="${RESTORE_URL}" --no-owner --no-privileges "${LATEST_BACKUP}"

TABLES_OK=$(sudo -u "${APP_USER}" psql "${RESTORE_URL}" -v ON_ERROR_STOP=1 -tAc \
  "SELECT to_regclass('public.games') IS NOT NULL AND to_regclass('public.user') IS NOT NULL")
if [[ ${TABLES_OK} != t ]]; then
  echo "Restore completed, but expected tables were not found." >&2
  exit 1
fi

echo "Restore test passed using ${LATEST_BACKUP}."
