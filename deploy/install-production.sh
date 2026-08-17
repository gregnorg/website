#!/usr/bin/env bash

set -Eeuo pipefail

if [[ ${EUID} -ne 0 || -z ${SUDO_USER:-} || ${SUDO_USER} == root ]]; then
  echo "Run this script from the application account: sudo ./deploy/install-production.sh" >&2
  exit 1
fi

WEBSITE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
APP_USER=${SUDO_USER}
APP_GROUP=$(id -gn "${APP_USER}")
APP_HOME=$(getent passwd "${APP_USER}" | cut -d: -f6)
NODE_BIN=$(sudo -u "${APP_USER}" -H env NVM_DIR="${APP_HOME}/.nvm" bash -c \
  'source "$NVM_DIR/nvm.sh" && command -v node')

if [[ ! -x ${NODE_BIN} ]]; then
  echo "Node.js executable was not found for ${APP_USER}." >&2
  exit 1
fi

render_unit() {
  local source_file=$1
  local destination_file=$2
  sed \
    -e "s|@@APP_USER@@|${APP_USER}|g" \
    -e "s|@@APP_GROUP@@|${APP_GROUP}|g" \
    -e "s|@@WEBSITE_DIR@@|${WEBSITE_DIR}|g" \
    -e "s|@@NODE_BIN@@|${NODE_BIN}|g" \
    "${source_file}" > "${destination_file}"
  chmod 0644 "${destination_file}"
}

systemctl disable --now \
  turntable.service \
  turntable-backup.timer \
  turntable-healthcheck.timer 2>/dev/null || true
rm -f \
  /etc/systemd/system/turntable.service \
  /etc/systemd/system/turntable-backup.service \
  /etc/systemd/system/turntable-backup.timer \
  /etc/systemd/system/turntable-healthcheck.service \
  /etc/systemd/system/turntable-healthcheck.timer

render_unit "${WEBSITE_DIR}/deploy/shoveactually.service" /etc/systemd/system/shoveactually.service
render_unit "${WEBSITE_DIR}/deploy/shoveactually-backup.service" /etc/systemd/system/shoveactually-backup.service
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-backup.timer" /etc/systemd/system/shoveactually-backup.timer
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-healthcheck.service" /etc/systemd/system/shoveactually-healthcheck.service
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-healthcheck.timer" /etc/systemd/system/shoveactually-healthcheck.timer
install -m 0644 "${WEBSITE_DIR}/deploy/cloudflared.service" /etc/systemd/system/cloudflared.service
install -m 0644 "${WEBSITE_DIR}/deploy/cloudflared-update.service" /etc/systemd/system/cloudflared-update.service
install -m 0644 "${WEBSITE_DIR}/deploy/cloudflared-update.timer" /etc/systemd/system/cloudflared-update.timer
install -d -m 0700 -o "${APP_USER}" -g "${APP_GROUP}" /var/backups/turntable

systemctl daemon-reload
systemctl enable --now postgresql
systemctl enable shoveactually cloudflared shoveactually-backup.timer shoveactually-healthcheck.timer cloudflared-update.timer
systemctl restart shoveactually
systemctl restart cloudflared
systemctl start shoveactually-backup.service
systemctl start shoveactually-backup.timer
systemctl start shoveactually-healthcheck.service
systemctl start shoveactually-healthcheck.timer

systemctl --no-pager --full status shoveactually cloudflared shoveactually-backup.timer shoveactually-healthcheck.timer
"${WEBSITE_DIR}/scripts/test-backup-restore.sh"

echo "Production services installed and the first backup was restored successfully."
