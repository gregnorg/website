#!/usr/bin/env bash
# Load .env.local and purge all games/moves while preserving users.
# Usage:
#   ./scripts/purge_all_games_envlocal.sh
# This assumes .env.local exists in the repository root.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
SCRIPT="$ROOT_DIR/scripts/purge_all_games.sh"

if [ ! -f "$ENV_FILE" ]; then
  echo ".env.local not found at $ENV_FILE"
  exit 1
fi

if [ ! -x "$SCRIPT" ]; then
  echo "$SCRIPT is not executable. Run: chmod +x $SCRIPT"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

echo "Sourced $ENV_FILE"

# Forward all args to purge_all_games.sh
exec "$SCRIPT" "$@"
