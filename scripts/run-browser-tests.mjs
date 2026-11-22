import { closeSync, copyFileSync, mkdirSync, openSync, readFileSync, symlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { withIsolatedDatabase } from "./isolated-database.mjs";

await withIsolatedDatabase(async (env, { root }) => {
  const copy = path.join(root, "app");
  mkdirSync(copy);
  const files = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  if (files.status !== 0) throw new Error("Cannot enumerate application source.");
  for (const file of files.stdout.split("\0").filter(Boolean)) {
    const target = path.join(copy, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
  symlinkSync(path.resolve("node_modules"), path.join(copy, "node_modules"), "dir");
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, "localhost", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const baseURL = `http://localhost:${port}`;
  const testEnv = { ...env, PORT: String(port), NODE_ENV: "development", E2E_BASE_URL: baseURL,
    E2E_ISOLATED_DB: "1", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), PUBLIC_SITE_URL: baseURL };
  const logPath = path.join(root, "browser-server.log");
  const log = openSync(logPath, "w", 0o600);
  const server = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "localhost", "--port", String(port)], {
    cwd: copy, env: testEnv, stdio: ["ignore", log, log], detached: true,
  });
  closeSync(log);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error("Browser test server exited before becoming ready.");
      try { ready = (await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Wait for compilation. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Browser test server did not become ready.");
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], { env: testEnv, stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", resolve);
    });
    if (result !== 0) throw new Error(`Browser tests failed (${result}).`);
  } catch (error) {
    console.error(readFileSync(logPath, "utf8").split("\n").slice(-60).join("\n"));
    throw error;
  } finally {
    const exit = new Promise(resolve => server.once("exit", resolve));
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already exited. */ }
    if (server.exitCode === null) await exit;
  }
});
