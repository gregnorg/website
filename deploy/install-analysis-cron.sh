#!/usr/bin/env bash
set -Eeuo pipefail

WEBSITE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
NODE_BIN=$(command -v node)
[[ -x ${NODE_BIN} ]]
[[ -x /usr/bin/flock && -x /usr/bin/logger ]]
mkdir -p "${WEBSITE_DIR}/output"
work_dir=$(mktemp -d)
trap 'rm -rf -- "${work_dir}"' EXIT
if ! LC_ALL=C crontab -l > "${work_dir}/existing" 2> "${work_dir}/error"; then
  if ! rg -q 'no crontab for' "${work_dir}/error"; then
    cat "${work_dir}/error" >&2
    exit 1
  fi
fi
python3 - "${WEBSITE_DIR}" "${NODE_BIN}" "${work_dir}" <<'PY'
import pathlib, shlex, sys
website, node, scratch = sys.argv[1:]
scratch = pathlib.Path(scratch)
start, end = '# BEGIN SHOVEACTUALLY REPLAY ANALYSIS', '# END SHOVEACTUALLY REPLAY ANALYSIS'
lines, in_block = [], False
for line in (scratch / 'existing').read_text().splitlines():
    if line == start:
        in_block = True
    elif line == end:
        in_block = False
    elif not in_block:
        lines.append(line)
if in_block:
    raise SystemExit('Existing analysis cron block is incomplete; refusing to overwrite it.')
command = shlex.join(['/usr/bin/flock', '-n', website + '/output/replay-analysis-cron.lock',
                       '/bin/bash', website + '/scripts/run-replay-analysis.sh', node])
# Cron treats percent specially even inside shell quotes.
command = command.replace('%', r'\%')
lines += [start, '* * * * * ' + command, end]
(scratch / 'crontab').write_text('\n'.join(lines) + '\n')
PY
if [[ ${1:-} == --print ]]; then
  cat "${work_dir}/crontab"
else
  crontab "${work_dir}/crontab"
  echo "Replay analysis and outage monitoring scheduled in the application account's crontab."
fi
