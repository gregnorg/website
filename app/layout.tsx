import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOutLink } from "@/components/sign-out-link";
import { isAdmin } from "@/lib/admin";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shove Actually",
  description: "It’s okay to be pushy.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  const admin = session ? await isAdmin(session.user.id) : false;

  return (
    <html lang="en">
      <body>
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
