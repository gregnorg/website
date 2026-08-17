# Turntable

A deliberately simple asynchronous board-game site. The first playable game is tic-tac-toe; the long-term goal is Push Fight.

## Local setup

Everything, including PostgreSQL, runs inside the Ubuntu WSL instance.

Install the system packages:

```sh
sudo apt update
sudo apt install -y curl ca-certificates build-essential postgresql postgresql-client
sudo service postgresql start
```

Create a local database and application user. Replace the example password in
both this command and `.env.local`:

```sh
sudo -u postgres psql
```

At the PostgreSQL prompt, run:

```sql
CREATE USER turntable WITH PASSWORD 'change-this-password';
CREATE DATABASE turntable OWNER turntable;
\q
```

Then set up the application:

1. Install Node.js 24 LTS inside Ubuntu (not only on Windows).
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set the same local database password.
4. Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.
5. Run `npx auth@latest migrate` to create the authentication tables.
6. Run `psql "$DATABASE_URL" -f database/schema.sql` after exporting the URL,
   or pass the URL from `.env.local` directly to `psql`.
7. Run `npm run migrate` to apply any migrations added after the base schema.
8. Run `npm run dev` and open `http://localhost:3000` in Windows.

The local connection should resemble:

```text
postgresql://turntable:change-this-password@localhost:5432/turntable
```

PostgreSQL may need to be started again after WSL restarts:

```sh
sudo service postgresql start
```

The development server listens on `0.0.0.0`. The production server listens on
`127.0.0.1` and is intended to be reached through the local Cloudflare Tunnel.

## Host from WSL

For a production-style server:

```sh
npm ci
npm run build
npm start
```

For public hosting, install the service files under `deploy/` so the application
and database backups survive reboots without an open terminal.

```sh
sudo ./deploy/install-production.sh
```

To make the site available to other devices on the same network:

1. Allow inbound TCP port 3000 in Windows Defender Firewall.
2. If your WSL version does not use mirrored networking, create a Windows
   port proxy from port 3000 to the current WSL IP. The WSL IP can change
   after a restart, so the proxy may need to be updated.

Do not expose the development server directly to the public internet. For
internet hosting, put the production server behind HTTPS and a reverse proxy.

## Commands

- `npm run dev` — development server on all network interfaces
- `npm test` — game-rule tests
- `npm run lint` — lint checks
- `npm run build` — production build
- `npm run migrate` — apply pending database migrations
- `npm start` — production server on loopback for the local reverse proxy/tunnel

## Production operations

- Public registration is always available until the database reaches its hard
  limit of 50 users. The database serializes concurrent signups so the limit
  cannot be exceeded.
- `GET /api/health` checks both the application and its database connection.
- `deploy/shoveactually.service` runs the application with automatic restart.
- `deploy/shoveactually-healthcheck.timer` records a health check in the system
  journal every five minutes.
- `deploy/shoveactually-backup.timer` creates and validates daily PostgreSQL dumps,
  retaining 30 days in `/var/backups/turntable`.
- `scripts/test-backup-restore.sh` restores the newest dump into a disposable
  database, verifies core tables, and removes the disposable database.

## Top-level scripts

- `scripts/apply-migration.js` — helper for applying DB schema migrations from `.env.local`
- `scripts/purge_games.sql` — SQL to delete game-related rows
- `scripts/purge_games.sh` — wrapper to run `purge_games.sql` using `psql`
- `scripts/purge_all_games.sql` — SQL to delete all games, game_players, and moves while preserving user accounts
- `scripts/purge_all_games.sh` — wrapper to run `purge_all_games.sql` using `psql`
- `scripts/purge_all_games_envlocal.sh` — wrapper that sources `.env.local` and runs `scripts/purge_all_games.sh`
