import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turntable",
  description: "Simple turn-based games with friends.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link className="brand" href="/">Turntable</Link>
          <nav><Link href="/login">Log in</Link><Link className="button small" href="/signup">Create account</Link></nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
