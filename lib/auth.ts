import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { hostname, networkInterfaces } from "node:os";
import { pool } from "@/lib/db";

const port = process.env.PORT ?? "3000";
const productionHosts = ["shoveactually.com", "www.shoveactually.com"];
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
    allowedHosts: [...productionHosts, ...localHosts],
    protocol: process.env.NODE_ENV === "production" ? "https" : "http",
  },
  database: pool,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
  plugins: [username({
    minUsernameLength: 3,
    maxUsernameLength: 24,
    usernameNormalization: false,
  })],
});
