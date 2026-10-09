import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import { transferChampionship } from "../lib/championship.ts";
import { crownEmail } from "../lib/crown-email.ts";

test("crown announcement celebrates both players and links to the rankings", () => {
  const email = crownEmail("NewChamp", "OldChamp", "https://example.test/");
  assert.match(email.subject, /👑.*NewChamp/);
  assert.match(email.text, /NewChamp has dethroned OldChamp/);
  assert.match(email.text, /https:\/\/example.test\/leaderboard/);
});

test("only real crown transfers queue private emails for everyone, transactionally", async t => {
  if (!process.env.DATABASE_URL) { t.skip("DATABASE_URL is not configured"); return; }
  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  const suffix = randomUUID();
  const ids = ["champ", "challenger", "spectator"].map(name => `${name}-${suffix}`);
  for (const id of ids) {
    await client.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", username, "displayUsername", email_notifications)
      VALUES ($1, $1, $2, false, now(), now(), $1, $1, false)`, [id, `${id}@example.test`]);
  }
  await client.query("DELETE FROM champion_state");
  const count = async () => Number((await client.query("SELECT count(*) FROM crown_announcements")).rows[0].count);
  const before = await count();
  await transferChampionship(client, ids[0], ids[1]);
  assert.equal(await count(), before, "initial coronation is not a change of hands");
  await transferChampionship(client, ids[1], ids[2]);
  assert.equal(await count(), before, "ordinary wins do not change the crown");
  await client.query("SAVEPOINT transfer_test");
  await transferChampionship(client, ids[1], ids[0]);
  assert.equal(await count(), before + 1);
  const email = (await client.query("SELECT * FROM crown_announcements WHERE winner_name = $1", [ids[1]])).rows[0];
  assert.equal(email.previous_name, ids[0]);
  for (const id of ids) assert.ok(email.recipients.includes(`${id}@example.test`));
  assert.equal(email.sent_at, null);
  await transferChampionship(client, ids[1], ids[0]);
  assert.equal(await count(), before + 1, "repeated result does not duplicate announcements");
  await client.query("ROLLBACK TO SAVEPOINT transfer_test");
  assert.equal(await count(), before, "rolled-back results never announce a transfer");
  assert.equal((await client.query("SELECT user_id FROM champion_state")).rows[0].user_id, ids[0]);
});
