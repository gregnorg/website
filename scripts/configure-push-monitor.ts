import { readFileSync, appendFileSync } from "node:fs";
import { pool } from "../lib/db.ts";
try {
  const contents = readFileSync(".env.local", "utf8");
  if (/^PUSH_MONITOR_EMAIL=.+$/m.test(contents)) {
    console.log("Notification monitoring fallback destination is already configured.");
  } else {
    const result = await pool.query<{ email: string }>(`SELECT email FROM "user" WHERE 'admin'=ANY(string_to_array(role,',')) AND banned IS NOT TRUE ORDER BY id`);
    if (!result.rows.length) throw new Error("No site admin exists for notification alerts.");
    appendFileSync(".env.local", `${contents.endsWith("\n") ? "" : "\n"}PUSH_MONITOR_EMAIL=${result.rows.map(row=>row.email).join(",")}\n`);
    console.log("Notification monitoring fallback destination configured from site admin accounts.");
  }
} finally { await pool.end(); }
