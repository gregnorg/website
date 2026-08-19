import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOutLink } from "@/components/sign-out-link";
import { isAdmin } from "@/lib/admin";
import { PwaRegistration } from "@/components/pwa-registration";
import { pool } from "@/lib/db";
import { currentPlayerId, type GameType } from "@/lib/game-state";
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
        <header>
          <Link className="brand" href="/">Shove Actually</Link>
          <nav>
            {session ? (
              <>
                <Link className="header-username" href="/account">{session.user.username}</Link>
                <Link className="games-link" href="/games">
                  Games
                  {turnCount > 0 && (
                    <span className="notification-badge" aria-label={`${turnCount} ${turnCount === 1 ? "game" : "games"} waiting for your move`}>
                      {turnCount}
                    </span>
                  )}
                </Link>
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

async function gamesWaitingForMove(userId: string) {
  const result = await pool.query<{
    game_type: GameType;
    x_player_id: string;
    o_player_id: string;
    move_count: number;
    setup_move_count: number;
    last_turn_player_id: string | null;
  }>(
    `SELECT g.game_type, xplayer.user_id AS x_player_id, oplayer.user_id AS o_player_id,
            COUNT(m.id)::int AS move_count,
            COUNT(m.id) FILTER (WHERE m.payload->>'type' = 'setup')::int AS setup_move_count,
            (ARRAY_AGG(m.player_id ORDER BY m.move_number DESC)
              FILTER (WHERE m.payload->>'type' IN ('push', 'turn')))[1] AS last_turn_player_id
       FROM games g
       JOIN game_players me ON me.game_id = g.id AND me.user_id = $1
       JOIN game_players xplayer ON xplayer.game_id = g.id AND xplayer.mark = 'X'
       JOIN game_players oplayer ON oplayer.game_id = g.id AND oplayer.mark = 'O'
       LEFT JOIN moves m ON m.game_id = g.id
      WHERE g.status = 'active' AND me.cleared_at IS NULL
      GROUP BY g.id, xplayer.user_id, oplayer.user_id`,
    [userId],
  );

  return result.rows.filter((game) => currentPlayerId(
    game.game_type,
    game.x_player_id,
    game.o_player_id,
    {
      moveCount: game.move_count,
      setupMoveCount: game.setup_move_count,
      lastTurnPlayerId: game.last_turn_player_id,
    },
  ) === userId).length;
}
