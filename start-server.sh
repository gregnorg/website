#!/usr/bin/env bash

set -Eeuo pipefail

WEBSITE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"

if [[ ${EUID} -eq 0 ]]; then
  echo "Do not run this script with sudo. Run: ./start-server.sh" >&2
  exit 1
fi

if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
  echo "nvm was not found at ${NVM_DIR}. Run setup-linux-mint.sh first." >&2
  exit 1
fi

if [[ ! -f "${WEBSITE_DIR}/.env.local" ]]; then
  echo "${WEBSITE_DIR}/.env.local is missing. Run setup-linux-mint.sh first." >&2
  exit 1
fi

if ! pg_isready -q; then
  echo "PostgreSQL is not running or is not accepting connections." >&2
  echo "Start it with: sudo systemctl start postgresql" >&2
  exit 1
fi

source "${NVM_DIR}/nvm.sh"
cd "${WEBSITE_DIR}"

if [[ ! -d node_modules ]]; then
  echo "Installing project dependencies..."
  npm ci
fi

echo "Building the production server..."
npm run build

echo "Starting Turntable at http://localhost:3000"
exec npm start
