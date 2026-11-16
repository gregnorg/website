import assert from "node:assert/strict";
import test from "node:test";
import { databaseConnectionConfig } from "../lib/database-config.ts";

test("local database connections retain their configuration", () => {
  assert.deepEqual(databaseConnectionConfig({ DATABASE_URL: "postgresql://localhost/test" }), { connectionString: "postgresql://localhost/test" });
});

test("remote TLS verifies certificates even when the connection URL requests no verification", () => {
  const config = databaseConnectionConfig({
    DATABASE_URL: "postgresql://db.example/test?sslmode=no-verify&application_name=test",
    DATABASE_SSL: "true", DATABASE_SSL_CA: "first\\nsecond",
  });
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: "first\nsecond" });
  assert.equal(new URL(config.connectionString!).searchParams.has("sslmode"), false);
  assert.equal(new URL(config.connectionString!).searchParams.get("application_name"), "test");
  assert.deepEqual(databaseConnectionConfig({ DATABASE_SSL: "true" }).ssl, { rejectUnauthorized: true });
});
