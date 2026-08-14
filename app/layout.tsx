import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOutLink } from "@/components/sign-out-link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turntable",
  description: "Simple turn-based games with friends.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <html lang="en">
      <body>
        <header>
          <Link className="brand" href="/">Turntable</Link>
          <nav>
            {session ? (
              <>
                <Link className="header-username" href="/games">{session.user.username}</Link>
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
