import { pool } from "@/lib/db";

export type LeaderboardPlayer = {
  id: string;
  username: string;
  wins: number;
  completedGames: number;
  winPercentage: number;
  currentStreak: number;
};

export type Leaderboards = {
  byPercentage: LeaderboardPlayer[];
  byWins: LeaderboardPlayer[];
  byStreak: LeaderboardPlayer[];
  champion: LeaderboardPlayer | null;
};

export async function getLeaderboards(): Promise<Leaderboards> {
  const [usersResult, gamesResult, championResult] = await Promise.all([
    pool.query<{ id: string; username: string; wins: number; completed_games: number }>(
      `SELECT u.id, u.username,
              COUNT(g.id) FILTER (WHERE g.status = 'won' AND g.winner_id = u.id)::int AS wins,
              COUNT(g.id) FILTER (WHERE g.status IN ('won', 'draw'))::int AS completed_games
         FROM "user" u
         LEFT JOIN game_players gp ON gp.user_id = u.id
         LEFT JOIN games g
           ON g.id = gp.game_id
          AND g.updated_at >= now() - interval '30 days'
        GROUP BY u.id, u.username`,
    ),
    pool.query<{ status: string; winner_id: string | null; player_ids: string[] }>(
      `SELECT g.status, g.winner_id,
              ARRAY_AGG(gp.user_id ORDER BY gp.user_id) AS player_ids
         FROM games g
         JOIN game_players gp ON gp.game_id = g.id
        WHERE g.status IN ('won', 'draw')
          AND g.updated_at >= now() - interval '30 days'
        GROUP BY g.id
        ORDER BY g.updated_at DESC, g.id DESC`,
    ),
    pool.query<{ user_id: string }>("SELECT user_id FROM champion_state WHERE singleton = true"),
  ]);

  const streaks = new Map<string, number>();
  const stopped = new Set<string>();
  for (const game of gamesResult.rows) {
    for (const playerId of game.player_ids) {
      if (stopped.has(playerId)) continue;
      if (game.status === "won" && game.winner_id === playerId) {
        streaks.set(playerId, (streaks.get(playerId) ?? 0) + 1);
      } else {
        stopped.add(playerId);
      }
    }
  }

  const players = usersResult.rows.map((user) => ({
    id: user.id,
    username: user.username,
    wins: user.wins,
    completedGames: user.completed_games,
    winPercentage: user.completed_games === 0 ? 0 : user.wins / user.completed_games,
    currentStreak: streaks.get(user.id) ?? 0,
  }));
  const nameOrder = (a: LeaderboardPlayer, b: LeaderboardPlayer) => a.username.localeCompare(b.username);
  const byPercentage = [...players].sort((a, b) =>
    b.winPercentage - a.winPercentage || b.completedGames - a.completedGames || b.wins - a.wins || nameOrder(a, b));
  const byWins = [...players].sort((a, b) =>
    b.wins - a.wins || b.winPercentage - a.winPercentage || nameOrder(a, b));
  const byStreak = [...players].sort((a, b) =>
    b.currentStreak - a.currentStreak || b.wins - a.wins || nameOrder(a, b));
  const championId = championResult.rows[0]?.user_id;

  return {
    byPercentage,
    byWins,
    byStreak,
    champion: players.find((player) => player.id === championId) ?? null,
  };
}
