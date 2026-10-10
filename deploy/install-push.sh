#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 || -z ${SUDO_USER:-} || ${SUDO_USER} == root ]]; then
  echo "Run from the application account: sudo bash deploy/install-push.sh" >&2
  exit 1
fi

WEBSITE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
APP_USER=${SUDO_USER}
APP_GROUP=$(id -gn "${APP_USER}")
APP_HOME=$(getent passwd "${APP_USER}" | cut -d: -f6)
NODE_BIN=$(sudo -u "${APP_USER}" -H env NVM_DIR="${APP_HOME}/.nvm" bash -c \
  'source "$NVM_DIR/nvm.sh" && command -v node')
[[ -x ${NODE_BIN} ]]

sed \
  -e "s|@@APP_USER@@|${APP_USER}|g" \
  -e "s|@@APP_GROUP@@|${APP_GROUP}|g" \
  -e "s|@@WEBSITE_DIR@@|${WEBSITE_DIR}|g" \
  -e "s|@@NODE_BIN@@|${NODE_BIN}|g" \
  "${WEBSITE_DIR}/deploy/shoveactually-push.service" > /etc/systemd/system/shoveactually-push.service
chmod 0644 /etc/systemd/system/shoveactually-push.service
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-push.timer" /etc/systemd/system/shoveactually-push.timer
sed \
  -e "s|@@APP_USER@@|${APP_USER}|g" \
  -e "s|@@APP_GROUP@@|${APP_GROUP}|g" \
  -e "s|@@WEBSITE_DIR@@|${WEBSITE_DIR}|g" \
  -e "s|@@NODE_BIN@@|${NODE_BIN}|g" \
  "${WEBSITE_DIR}/deploy/shoveactually-push-monitor.service" > /etc/systemd/system/shoveactually-push-monitor.service
chmod 0644 /etc/systemd/system/shoveactually-push-monitor.service
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-push-monitor.timer" /etc/systemd/system/shoveactually-push-monitor.timer
sudo -u "${APP_USER}" "${NODE_BIN}" --env-file="${WEBSITE_DIR}/.env.local" "${WEBSITE_DIR}/scripts/configure-push-monitor.ts"
systemctl daemon-reload
systemctl restart shoveactually
systemctl enable --now shoveactually-push.timer
systemctl start shoveactually-push.service
systemctl --no-pager --full status shoveactually-push.timer
systemctl enable --now shoveactually-push-monitor.timer
systemctl start shoveactually-push-monitor.service
systemctl --no-pager --full status shoveactually-push-monitor.timer
