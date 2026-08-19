import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOutLink } from "@/components/sign-out-link";
import { isAdmin } from "@/lib/admin";
import { PwaRegistration } from "@/components/pwa-registration";
import { AppIconBadge } from "@/components/app-icon-badge";
import { gamesWaitingForMove } from "@/lib/turn-count";
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
  themeColor: "#295b45",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  const admin = session ? await isAdmin(session.user.id) : false;
  const turnCount = session ? await gamesWaitingForMove(session.user.id) : 0;

  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        <AppIconBadge initialCount={turnCount} />
        <header>
          <Link className="brand" href="/">Shove Actually</Link>
          <nav>
            {session ? (
              <>
                <Link className="header-username" href="/account">{session.user.username}</Link>
                <Link href="/games">Games</Link>
                {admin && <Link href="/admin">Admin</Link>}
                <SignOutLink />
              </>
            ) : (
              <>
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
