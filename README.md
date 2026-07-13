# Turntable

A deliberately simple asynchronous board-game site. The first playable game is tic-tac-toe; the long-term goal is Push Fight.

## Local setup

1. Install Node.js 24 LTS.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and add the Neon connection string.
4. Run `npx auth@latest migrate` to create the authentication tables.
5. Apply `database/schema.sql` to the Neon database.
6. Run `npm run dev` and open `http://localhost:3000`.

## Commands

- `npm run dev` — development server
- `npm test` — game-rule tests
- `npm run lint` — lint checks
- `npm run build` — production build
