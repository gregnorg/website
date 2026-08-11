#!/usr/bin/env bash
# Purge all games and related rows using psql.
# Usage:
#  DATABASE_URL=postgres://user:pass@host:port/dbname ./scripts/purge_games.sh
# or set PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT env vars and run the script.

set -euo pipefail

if [ -z "${DATABASE_URL-}" ]; then
  echo "DATABASE_URL not set. Falling back to lib/db connection environment variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT)."
fi

SQL_FILE="$(dirname "$0")/purge_games.sql"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found in PATH. Install PostgreSQL client or run the SQL manually."
  exit 1
fi

echo "This will permanently DELETE all rows from moves, game_players, and games."
read -p "Are you sure you want to proceed? Type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted." 
  exit 0
fi

if [ -n "${DATABASE_URL-}" ]; then
  psql "$DATABASE_URL" -f "$SQL_FILE"
else
  psql -f "$SQL_FILE"
fi

echo "Purge completed."
