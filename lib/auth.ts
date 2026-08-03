import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
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
    // This server is accessed directly over HTTP on the local network.
    // Change this to "https" when an HTTPS reverse proxy is added.
    protocol: "http",
  },
  database: pool,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [username({
    minUsernameLength: 3,
    maxUsernameLength: 24,
    usernameNormalization: false,
  })],
});
