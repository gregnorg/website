#!/usr/bin/env bash

set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Optional first-run configuration. Secure database and authentication secrets
# are generated automatically when omitted. A remotely-managed Cloudflare
# Tunnel token is requested securely when /etc/cloudflared/token is absent.
# -----------------------------------------------------------------------------
DB_PASSWORD="${DB_PASSWORD:-}"
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-}"
CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
RESEND_API_KEY="${RESEND_API_KEY:-}"
RESEND_FROM_EMAIL="${RESEND_FROM_EMAIL:-}"

# Optional configuration. The defaults normally do not need to be changed.
DB_USER="turntable"
DB_NAME="turntable"
NODE_VERSION="24"

# The website directory is the directory containing this script.
WEBSITE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE="${WEBSITE_DIR}/.env.local"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo: sudo ./setup-linux-mint.sh" >&2
  exit 1
fi

if [[ -z ${SUDO_USER:-} || ${SUDO_USER} == "root" ]]; then
  echo "Run this script from your normal account using sudo, not as root directly." >&2
  exit 1
fi

if [[ ${DB_PASSWORD} =~ [^A-Za-z0-9_-] ]]; then
  echo "DB_PASSWORD must contain only letters, numbers, hyphens, and underscores." >&2
  exit 1
fi

if [[ ! ${DB_USER} =~ ^[A-Za-z_][A-Za-z0-9_]*$ || \
      ! ${DB_NAME} =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "DB_USER and DB_NAME must be valid PostgreSQL identifiers." >&2
  exit 1
fi

if [[ ! -f "${WEBSITE_DIR}/package.json" || ! -f "${WEBSITE_DIR}/database/schema.sql" ]]; then
  echo "WEBSITE_DIR does not appear to contain the Turntable website: ${WEBSITE_DIR}" >&2
  exit 1
fi

APP_USER=${SUDO_USER}
APP_HOME=$(getent passwd "${APP_USER}" | cut -d: -f6)
NVM_DIR="${APP_HOME}/.nvm"

echo "Installing Linux packages..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  curl ca-certificates build-essential postgresql postgresql-client openssl
systemctl enable --now postgresql

if [[ ! -f ${ENV_FILE} ]]; then
  DB_PASSWORD=${DB_PASSWORD:-$(openssl rand -hex 32)}
  BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-$(openssl rand -base64 32)}
fi

if [[ -f ${ENV_FILE} ]]; then
  DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' "${ENV_FILE}" | head -n 1)
  EFFECTIVE_AUTH_SECRET=$(sed -n 's/^BETTER_AUTH_SECRET=//p' "${ENV_FILE}" | head -n 1)
  if [[ -z ${DATABASE_URL} || -z ${EFFECTIVE_AUTH_SECRET} ]]; then
    echo "${ENV_FILE} is missing DATABASE_URL or BETTER_AUTH_SECRET." >&2
    exit 1
  fi
else
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
  EFFECTIVE_AUTH_SECRET=${BETTER_AUTH_SECRET}
fi

echo "Installing Cloudflare Tunnel..."
install -d -m 0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  -o /usr/share/keyrings/cloudflare-main.gpg
chmod 0644 /usr/share/keyrings/cloudflare-main.gpg
printf '%s\n' \
  'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  > /etc/apt/sources.list.d/cloudflared.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y cloudflared

if [[ ! -f /etc/cloudflared/token ]]; then
  if [[ -z ${CLOUDFLARE_TUNNEL_TOKEN} ]]; then
    read -r -s -p "Cloudflare Tunnel token: " CLOUDFLARE_TUNNEL_TOKEN
    echo
  fi
  if [[ -z ${CLOUDFLARE_TUNNEL_TOKEN} || ${CLOUDFLARE_TUNNEL_TOKEN} == *$'\n'* ]]; then
    echo "A valid Cloudflare Tunnel token is required." >&2
    exit 1
  fi
  install -d -m 0755 /etc/cloudflared
  printf '%s' "${CLOUDFLARE_TUNNEL_TOKEN}" \
    | install -m 0600 -o root -g root /dev/stdin /etc/cloudflared/token
fi

echo "Installing nvm and Node.js ${NODE_VERSION} for ${APP_USER}..."
if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
  sudo -u "${APP_USER}" -H bash -c \
    'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash'
fi

sudo -u "${APP_USER}" -H env NVM_DIR="${NVM_DIR}" NODE_VERSION="${NODE_VERSION}" bash -c '
  set -Eeuo pipefail
  source "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VERSION"
  nvm alias default "$NODE_VERSION"
'

echo "Creating the PostgreSQL role and database if needed..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" | grep -q 1; then
  if [[ -f ${ENV_FILE} ]]; then
    echo "PostgreSQL role ${DB_USER} already exists; leaving it unchanged."
  else
    sudo -u postgres psql \
      -c "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
  fi
else
  if [[ -z ${DB_PASSWORD} ]]; then
    echo "PostgreSQL role ${DB_USER} is missing and DB_PASSWORD is blank." >&2
    exit 1
  fi
  sudo -u postgres psql \
    -c "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb --owner="${DB_USER}" "${DB_NAME}"
fi

if [[ ! -f ${ENV_FILE} ]]; then
  echo "Creating ${ENV_FILE}..."
  cat > "${ENV_FILE}" <<EOF
DATABASE_URL=${DATABASE_URL}
DATABASE_SSL=false
BETTER_AUTH_SECRET=${EFFECTIVE_AUTH_SECRET}
PUBLIC_SITE_URL=https://shoveactually.com
RESEND_API_KEY=${RESEND_API_KEY}
RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL}
EOF
  chown "${APP_USER}:$(id -gn "${APP_USER}")" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
else
  echo "${ENV_FILE} already exists; leaving it unchanged."
fi

echo "Installing project packages and initializing the database..."
sudo -u "${APP_USER}" -H env \
  NVM_DIR="${NVM_DIR}" \
  WEBSITE_DIR="${WEBSITE_DIR}" \
  DATABASE_URL="${DATABASE_URL}" \
  BETTER_AUTH_SECRET="${EFFECTIVE_AUTH_SECRET}" \
  bash -c '
    set -Eeuo pipefail
    source "$NVM_DIR/nvm.sh"
    cd "$WEBSITE_DIR"
    npm ci
    npx auth@latest migrate --yes
    if [[ $(psql "$DATABASE_URL" -tAc "SELECT to_regclass('"'"'public.games'"'"') IS NOT NULL") != "t" ]]; then
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql
    else
      echo "Game tables already exist; skipping database/schema.sql."
    fi
    npm run migrate
    npm run build
  '

echo
echo "Installing and starting production services..."
"${WEBSITE_DIR}/deploy/install-production.sh"

echo
echo "Setup complete. Shove Actually is installed and running."
