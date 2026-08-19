import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin, username } from "better-auth/plugins";
import { hostname, networkInterfaces } from "node:os";
import { Resend } from "resend";
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
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          const result = await pool.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM "user"`,
          );
          if (result.rows[0].count >= 50) {
            throw new APIError("BAD_REQUEST", {
              message: "Shove Actually has reached its 50-player limit.",
            });
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.RESEND_FROM_EMAIL;
      if (!apiKey || !from) throw new Error("Password reset email is not configured.");

      const response = await new Resend(apiKey).emails.send({
        from,
        to: user.email,
        subject: "Reset your Shove Actually password",
        text: `Reset your password using this link:\n\n${url}\n\nThis link expires in one hour. If you did not request it, you can ignore this email.`,
        html: `<p>Reset your Shove Actually password using the link below.</p><p><a href="${url}">Reset password</a></p><p>This link expires in one hour. If you did not request it, you can ignore this email.</p>`,
      });
      if (response.error) throw new Error(response.error.message);
    },
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 24,
      usernameNormalization: false,
    }),
    admin(),
  ],
});
