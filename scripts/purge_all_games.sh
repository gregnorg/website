#!/usr/bin/env bash
# Purge all games and related rows (moves, game_players, games) but do NOT touch user accounts.
# Usage:
#  DATABASE_URL=postgres://user:pass@host:port/dbname ./scripts/purge_all_games.sh
# or set PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT env vars and run the script.

set -euo pipefail

SQL_FILE="$(dirname "$0")/purge_all_games.sql"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found in PATH. Install PostgreSQL client or run the SQL manually."
  exit 1
fi

if [ -z "${DATABASE_URL-}" ]; then
  echo "DATABASE_URL not set. Falling back to PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT environment variables."
fi

echo "Preview counts (before purge):"
if [ -n "${DATABASE_URL-}" ]; then
  psql "$DATABASE_URL" -At -c "SELECT 'moves:'||count(*) FROM moves; SELECT 'game_players:'||count(*) FROM game_players; SELECT 'games:'||count(*) FROM games; SELECT 'users:'||count(*) FROM \"user\";"
else
  psql -At -c "SELECT 'moves:'||count(*) FROM moves; SELECT 'game_players:'||count(*) FROM game_players; SELECT 'games:'||count(*) FROM games; SELECT 'users:'||count(*) FROM \"user\";"
fi

echo
read -p "This will DELETE ALL games and related rows but keep users. Type 'yes' to proceed: " confirm
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
