import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOutLink } from "@/components/sign-out-link";
import { isAdmin } from "@/lib/admin";
import { PwaRegistration } from "@/components/pwa-registration";
import { AppIconBadge } from "@/components/app-icon-badge";
import { AppIconAlertPrompt } from "@/components/app-icon-alert-prompt";
import { gamesWaitingForMove } from "@/lib/turn-count";
import { pool } from "@/lib/db";
import { ChampionCrown } from "@/components/champion-crown";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shove Actually",
  description: "It’s okay to be pushy.",
  applicationName: "Shove Actually",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Shove Actually",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  const [admin, turnCount, championId] = session
    ? await Promise.all([
        isAdmin(session.user.id),
        gamesWaitingForMove(session.user.id),
        pool.query<{ user_id: string }>("SELECT user_id FROM champion_state WHERE singleton = true")
          .then((result) => result.rows[0]?.user_id ?? null),
      ])
    : [false, 0, null];

  return (
    <html lang="en">
      <body>
        <PwaRegistration userId={session?.user.id ?? null} />
        <AppIconBadge initialCount={turnCount} />
        {session && <AppIconAlertPrompt />}
        <header>
          <Link className="brand" href="/">Shove Actually</Link>
          <nav>
            {session ? (
              <>
                <Link className="header-username" href="/account">
                  {championId === session.user.id && <ChampionCrown />}{session.user.username}
                </Link>
                <Link href="/games">My Games</Link>
                <Link href="/games/all">All Games</Link>
                <Link href="/leaderboard">Leaderboard</Link>
                {admin && <Link href="/admin">Admin</Link>}
                <SignOutLink />
              </>
            ) : (
              <>
                <Link href="/games/all">All Games</Link>
                <Link href="/leaderboard">Leaderboard</Link>
                <Link href="/login">Log in</Link>
                <Link className="button small" href="/signup">Create account</Link>
              </>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
