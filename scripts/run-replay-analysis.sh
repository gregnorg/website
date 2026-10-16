#!/usr/bin/env bash
set -uo pipefail

WEBSITE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
NODE_BIN=${1:?Pass the absolute Node.js executable path}
cd "${WEBSITE_DIR}" || exit 1
failed=0
"${NODE_BIN}" --env-file=.env.local scripts/process-replay-analysis.ts 2>&1 |
  /usr/bin/logger -t shoveactually-analysis || failed=1
# Monitoring still runs if the analysis worker fails, and never needs a shell
# login or NVM initialization when invoked from cron.
"${NODE_BIN}" --env-file=.env.local scripts/check-replay-analysis.ts 2>&1 |
  /usr/bin/logger -t shoveactually-analysis-monitor || failed=1
exit "${failed}"
