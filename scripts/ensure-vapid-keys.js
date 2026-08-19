import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";

const envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Create .env.local before generating push notification keys.");
  process.exit(1);
}

const contents = fs.readFileSync(envPath, "utf8");
if (/^VAPID_PUBLIC_KEY=.+$/m.test(contents) && /^VAPID_PRIVATE_KEY=.+$/m.test(contents)) {
  console.log("VAPID keys are already configured.");
  process.exit(0);
}

const keys = webpush.generateVAPIDKeys();
const separator = contents.endsWith("\n") ? "" : "\n";
fs.appendFileSync(envPath, `${separator}VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:notifications@shoveactually.com\n`, { mode: 0o600 });
console.log("Generated VAPID keys in .env.local.");
