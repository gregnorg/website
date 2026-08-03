import { betterAuth } from "better-auth";
import { hostname, networkInterfaces } from "node:os";
import { pool } from "@/lib/db";

const port = process.env.PORT ?? "3000";
const localHosts = new Set([
  `localhost:${port}`,
  `127.0.0.1:${port}`,
  `[::1]:${port}`,
  `${hostname()}:${port}`,
  `${hostname()}.local:${port}`,
]);

for (const addresses of Object.values(networkInterfaces())) {
  for (const address of addresses ?? []) {
    const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
    localHosts.add(`${host}:${port}`);
  }
}

export const auth = betterAuth({
  baseURL: {
    allowedHosts: [...localHosts],
    protocol: "auto",
  },
  database: pool,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      username: { type: "string", required: true, unique: true },
    },
  },
});
