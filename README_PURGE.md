Purge all games and moves

This repo includes helper scripts to permanently delete all game-related data (moves, game_players, games) from the database.

Files:

- `scripts/purge_games.sql` — SQL to delete rows. Run with `psql`.
- `scripts/purge_games.sh` — convenience shell wrapper that runs the SQL using `psql`.

IMPORTANT — Backup first

Before running either script, create a database backup. Example using `pg_dump`:

```bash
# backed up to dump.sql
pg_dump "$DATABASE_URL" > dump.sql
```

Run the purge (example):

```bash
# using DATABASE_URL
DATABASE_URL=postgres://user:pass@host:5432/dbname ./scripts/purge_games.sh

# or set PG* env vars and run
export PGHOST=localhost
export PGUSER=turntable
export PGPASSWORD=...
export PGDATABASE=turntable
./scripts/purge_games.sh
```

The script will prompt for confirmation before deleting.

## `.env.local` helper

If your local config is stored in `.env.local`, you can source it and run the purge with:

```bash
./scripts/purge_all_games_envlocal.sh
```

This wrapper reads `.env.local`, exports `DATABASE_URL`, and forwards the purge request to `scripts/purge_all_games.sh`.

Recovery

If you made a backup using `pg_dump`, you can restore with:

```bash
psql "$DATABASE_URL" < dump.sql
```

Contact me if you want a Node-based migration script instead of raw SQL.
