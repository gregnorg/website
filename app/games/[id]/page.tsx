import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { Board, currentMark, EMPTY_BOARD } from "@/lib/game";
import { makeMove } from "./actions";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;

  const gameResult = await pool.query<{
    status: "active" | "won" | "draw" | "cancelled" | "waiting";
    winner_id: string | null;
    my_mark: "X" | "O";
    opponent_username: string;
  }>(
    `SELECT g.status, g.winner_id, me.mark AS my_mark,
            opponent.username AS opponent_username
       FROM games g
       JOIN game_players me
         ON me.game_id = g.id AND me.user_id = $2
       JOIN game_players them
         ON them.game_id = g.id AND them.user_id <> $2
       JOIN "user" opponent
         ON opponent.id = them.user_id
      WHERE g.id = $1`,
    [id, session.user.id],
  );
  if (!gameResult.rowCount) notFound();
  const game = gameResult.rows[0];

  const moves = await pool.query<{ position: number; mark: "X" | "O" }>(
    `SELECT m.position, gp.mark
       FROM moves m
       JOIN game_players gp
         ON gp.game_id = m.game_id AND gp.user_id = m.player_id
      WHERE m.game_id = $1
      ORDER BY m.move_number`,
    [id],
  );
  const board = [...EMPTY_BOARD] as Board;
  for (const move of moves.rows) board[move.position] = move.mark;
  const turn = currentMark(board);
  const canMove = game.status === "active" && turn === game.my_mark;

  let summary = `Waiting for ${game.opponent_username} to move.`;
  if (canMove) summary = `Your turn. You are ${game.my_mark}.`;
  if (game.status === "draw") summary = "Draw.";
  if (game.status === "won") {
    summary = game.winner_id === session.user.id
      ? "You won!"
      : `${game.opponent_username} won.`;
  }

  const moveAction = makeMove.bind(null, id);

  return (
    <section className="game-page">
      <Link className="back-link" href="/games">← All games</Link>
      <p className="kicker">Tic-tac-toe</p>
      <h1>vs. {game.opponent_username}</h1>
      <p className="game-summary">{summary}</p>
      {error && <p className="error game-error" role="alert">{error}</p>}
      <div className="game-board" aria-label="Tic-tac-toe board">
        {board.map((cell, position) => (
          <form action={moveAction} key={position}>
            <input type="hidden" name="position" value={position} />
            <button
              className="game-square"
              type="submit"
              aria-label={cell ? `Square ${position + 1}: ${cell}` : `Play square ${position + 1}`}
              disabled={Boolean(cell) || !canMove}
            >
              {cell}
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
