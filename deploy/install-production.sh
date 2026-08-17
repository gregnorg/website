#!/usr/bin/env bash

set -Eeuo pipefail

if [[ ${EUID} -ne 0 || -z ${SUDO_USER:-} || ${SUDO_USER} == root ]]; then
  echo "Run this script from the application account: sudo ./deploy/install-production.sh" >&2
  exit 1
fi

WEBSITE_DIR=/home/gregnorg/website
APP_USER=gregnorg
APP_GROUP=gregnorg

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

install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually.service" /etc/systemd/system/shoveactually.service
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-backup.service" /etc/systemd/system/shoveactually-backup.service
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-backup.timer" /etc/systemd/system/shoveactually-backup.timer
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-healthcheck.service" /etc/systemd/system/shoveactually-healthcheck.service
install -m 0644 "${WEBSITE_DIR}/deploy/shoveactually-healthcheck.timer" /etc/systemd/system/shoveactually-healthcheck.timer
install -m 0644 "${WEBSITE_DIR}/deploy/cloudflared.service" /etc/systemd/system/cloudflared.service
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
