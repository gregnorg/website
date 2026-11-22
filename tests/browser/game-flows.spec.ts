import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { settleTournament } from "../../lib/tournaments.ts";

const password = "Browser-test-password-123!";
const contexts: BrowserContext[] = [];
let db: Pool;

test.beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL!);
  if (process.env.E2E_ISOLATED_DB !== "1" || !url.searchParams.get("host")?.includes("/shove-tests-")) {
    throw new Error("Run npm run test:browser; browser fixtures require the disposable database.");
  }
  db = new Pool({ connectionString: url.toString(), max: 3 });
});
test.afterAll(async () => { await db?.end(); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map(context => context.close())); });

test("password forms remain disabled without JavaScript and use a POST fallback", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, javaScriptEnabled: false });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeDisabled();
  await expect(page.locator(".auth-panel form")).toHaveAttribute("method", "post");
});

async function account(browser: Browser) {
  const name = `player_${randomUUID().slice(0, 8)}`;
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, serviceWorkers: "block" });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(`${name}@example.test`);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/games$/);
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { name: "My Games", exact: true })).toBeVisible();
  const id = (await db.query('SELECT id FROM "user" WHERE username=$1', [name])).rows[0].id as string;
  return { name, id, context, page };
}

function cell(page: Page, row: number, col: number) {
  return page.locator(`.pf-board > button:is([style*="grid-row:${row + 1};"],[style*="grid-row: ${row + 1};"]):is([style*="grid-column:${col + 1}"],[style*="grid-column: ${col + 1}"])`);
}
const whiteSetup = [[0, 2], [0, 3], [1, 0], [1, 1], [1, 2]];
const blackSetup = [[0, 4], [0, 5], [0, 6], [1, 4], [1, 5]];
async function selectSetup(page: Page, pieces: number[][]) {
  for (const [row, col] of pieces) await cell(page, row, col).click();
  await expect(page.getByRole("button", { name: "Submit setup", exact: true })).toBeEnabled();
}
async function moveCount(game: string) {
  return Number((await db.query("SELECT count(*) n FROM moves WHERE game_id=$1", [game])).rows[0].n);
}

async function tournament(browser: Browser) {
  const a = await account(browser);
  const b = await account(browser);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const others = [randomUUID(), randomUUID()];
    for (const id of others) await client.query('INSERT INTO "user"(id,name,email,username,"emailVerified") VALUES($1,$1,$1,$1,false)', [id]);
    const tid = (await client.query("INSERT INTO tournaments(name,minutes,created_by) VALUES('Browser tournament',5,$1) RETURNING id", [a.id])).rows[0].id;
    await client.query(`INSERT INTO tournament_matches(tournament_id,round,slot,player1,player2)
      VALUES($1,0,0,$2,$3),($1,0,1,$4,$5),($1,1,0,NULL,NULL)`, [tid, a.id, b.id, ...others]);
    await settleTournament(client, tid);
    const game = (await client.query("SELECT game_id FROM tournament_matches WHERE tournament_id=$1 AND round=0 AND slot=0", [tid])).rows[0].game_id as string;
    const white = (await client.query("SELECT user_id FROM game_players WHERE game_id=$1 AND mark='X'", [game])).rows[0].user_id;
    await client.query("COMMIT");
    return { game, white: white === a.id ? a : b, black: white === a.id ? b : a };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

test("mobile signup, rejected login, and username login work without hydration errors", async ({ browser }) => {
  const user = await account(browser);
  const errors: string[] = [];
  user.page.on("pageerror", error => errors.push(error.message));
  await user.page.setViewportSize({ width: 390, height: 844 });
  await user.page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(user.page).toHaveURL(/\/login$/);
  await user.page.getByLabel("Username or email", { exact: true }).fill(user.name);
  await user.page.locator('input[name="password"]').fill("incorrect-password");
  await user.page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(user.page.locator(".auth-panel .error")).toContainText(/invalid|incorrect/i);
  await user.page.locator('input[name="password"]').fill(password);
  await user.page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(user.page).toHaveURL(/\/games$/);
  expect(errors).toEqual([]);
});

test("players create a timed match, complete setup, see server time, and submit a complete turn", async ({ browser }) => {
  const a = await account(browser);
  const b = await account(browser);
  await a.page.goto("/games/new");
  await a.page.getByRole("combobox", { name: /Opponent/ }).selectOption(b.name);
  await a.page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(a.page).toHaveURL(/\/games$/);
  const game = (await db.query("SELECT id FROM games WHERE created_by=$1 ORDER BY created_at DESC LIMIT 1", [a.id])).rows[0].id as string;
  const whiteId = (await db.query("SELECT user_id FROM game_players WHERE game_id=$1 AND mark='X'", [game])).rows[0].user_id;
  const [white, black] = whiteId === a.id ? [a, b] : [b, a];
  await white.page.goto(`/games/${game}`);
  await selectSetup(white.page, whiteSetup);
  await white.page.getByRole("button", { name: "Submit setup", exact: true }).click();
  await expect.poll(() => moveCount(game)).toBe(1);
  await black.page.goto(`/games/${game}`);
  await selectSetup(black.page, blackSetup);
  await black.page.getByRole("button", { name: "Submit setup", exact: true }).click();
  await expect.poll(() => moveCount(game)).toBe(2);
  await db.query("UPDATE game_players SET time_remaining_ms=290000 WHERE game_id=$1 AND user_id=$2", [game, white.id]);
  await white.page.reload();
  await expect(white.page.locator(".clock-white strong")).toHaveText(/4:4[0-9]|4:50/);
  await cell(white.page, 1, 0).click();
  await cell(white.page, 2, 0).click();
  await cell(white.page, 0, 3).click();
  await cell(white.page, 0, 4).click();
  await white.page.getByRole("button", { name: "Submit turn", exact: true }).click();
  await expect.poll(() => moveCount(game)).toBe(3);
  await expect.poll(async () => (await db.query("SELECT status FROM games WHERE id=$1", [game])).rows[0].status).toBe("won");
});

test("live previews resume after an interrupted event stream without submitting a move", async ({ browser }) => {
  const { game, white, black } = await tournament(browser);
  let attempts = 0;
  await black.page.route("**/api/tournaments/live", route => ++attempts === 1 ? route.abort() : route.continue());
  await black.page.goto(`/games/${game}`);
  await expect.poll(() => attempts, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await white.page.goto(`/games/${game}`);
  await cell(white.page, 0, 2).click();
  await expect(black.page.getByText("Live preview · Turn not submitted yet", { exact: true })).toBeVisible();
  await expect(cell(black.page, 0, 2)).toHaveAttribute("aria-label", /white.*pusher/i);
  expect(await moveCount(game)).toBe(0);
});

test("an unresponsive preview upload does not block an official setup submission", async ({ browser }) => {
  const { game, white } = await tournament(browser);
  await white.page.route("**/api/games/*/preview", () => { /* Deliberately leave the upload unanswered. */ });
  await white.page.goto(`/games/${game}`);
  await selectSetup(white.page, whiteSetup);
  await white.page.getByRole("button", { name: "Submit setup", exact: true }).click();
  await expect.poll(() => moveCount(game), { timeout: 4000 }).toBe(1);
});
