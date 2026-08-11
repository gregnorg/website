import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { Board, currentMark, EMPTY_BOARD } from "@/lib/game";
import { makeMove } from "./actions";
import PushfightBoard from "@/components/pushfight-board";
import { applyMove, emptyBoard, movesSinceLastPush } from "@/lib/pushfight";

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

  const gameResult = await pool.query<any>(
    `SELECT g.status, g.winner_id, g.game_type, me.mark AS my_mark,
            opponent.username AS opponent_username, opponent.id AS opponent_id,
            xplayer.user_id AS x_player_id, oplayer.user_id AS o_player_id
       FROM games g
       JOIN game_players me
         ON me.game_id = g.id AND me.user_id = $2
       JOIN game_players them
         ON them.game_id = g.id AND them.user_id <> $2
       JOIN "user" opponent
         ON opponent.id = them.user_id
       JOIN game_players xplayer
         ON xplayer.game_id = g.id AND xplayer.mark = 'X'
       JOIN game_players oplayer
         ON oplayer.game_id = g.id AND oplayer.mark = 'O'
      WHERE g.id = $1`,
    [id, session.user.id],
  );
  if (!gameResult.rowCount) notFound();
  const game = gameResult.rows[0];

  const isTicTacToe = game.game_type === "tic_tac_toe";
  const moves = await pool.query<any>(
    `SELECT m.position, m.payload, gp.mark, m.player_id
       FROM moves m
       LEFT JOIN game_players gp
         ON gp.game_id = m.game_id AND gp.user_id = m.player_id
      WHERE m.game_id = $1
      ORDER BY m.move_number`,
    [id],
  );

  const board = [...EMPTY_BOARD] as Board;
  if (isTicTacToe) {
    for (const move of moves.rows) board[move.position] = move.mark;
  }
  const turn = isTicTacToe ? currentMark(board) : null;
  const xPlayerId = game.x_player_id;
  const oPlayerId = game.o_player_id;
  const setupMoves = moves.rows.filter((mv: any) => mv.payload?.type === "setup");
  const setupStage = !isTicTacToe && setupMoves.length < 2;
  const currentPlayerId = (() => {
    if (setupStage) {
      return setupMoves.length === 0 ? xPlayerId : oPlayerId;
    }
    let lastPushBy: string | null = null;
    for (const move of moves.rows) {
      if (move.payload?.type === "push") lastPushBy = move.player_id;
    }
    return lastPushBy === null ? xPlayerId : (lastPushBy === xPlayerId ? oPlayerId : xPlayerId);
  })();
  const movesThisTurn = movesSinceLastPush(moves.rows);
  const canMove = game.status === "active" && (isTicTacToe ? turn === game.my_mark : currentPlayerId === session.user.id);

  let summary = `Waiting for ${game.opponent_username} to move.`;
  if (setupStage) {
    const teamName = setupMoves.length === 0 ? "White" : "Black";
    summary = canMove
      ? `${teamName} team setup: place 3 squares and 2 circles.`
      : `Waiting for the ${teamName} team to finish setup.`;
  } else if (canMove) {
    summary = game.game_type === "tic_tac_toe"
      ? `Your turn. You are ${game.my_mark}.`
      : "Your turn.";
  }
  if (game.status === "draw") summary = "Draw.";
  if (game.status === "won") {
    summary = game.winner_id === session.user.id
      ? "You won!"
      : `${game.opponent_username} won.`;
  }

  const moveAction = makeMove;

  return (
    <section className="game-page">
      <Link className="back-link" href="/games">← All games</Link>
      <h1>vs. {game.opponent_username}</h1>
      <p className="game-summary">{summary}</p>
      {error && <p className="error game-error" role="alert">{error}</p>}
      {game.game_type === "tic_tac_toe" ? (
        <>
          <p className="kicker">Tic-tac-toe</p>
          <div className="game-board" aria-label="Tic-tac-toe board">
            {board.map((cell, position) => (
              <form action={moveAction} key={position}>
                <input type="hidden" name="gameId" value={id} />
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
        </>
      ) : (
        <>
          <p className="kicker">Pushfight (simplified)</p>
          <PushfightBoard
            board={(() => {
              const pfBoard = emptyBoard();
              for (const move of moves.rows) {
                if (!move.payload) continue;
                try {
                  applyMove(pfBoard, move.payload, move.player_id);
                } catch {
                  // ignore invalid historical moves for display
                }
              }
              return pfBoard;
            })()}
            gameId={id}
            myId={session.user.id}
            currentPlayerId={currentPlayerId}
            whitePlayerId={xPlayerId}
            blackPlayerId={oPlayerId}
            canMove={canMove}
            movesThisTurn={movesThisTurn}
            action={moveAction}
            isSetupPhase={setupStage}
            setupTeam={setupMoves.length === 0 ? "white" : "black"}
            setupTurnPlayerId={setupStage ? currentPlayerId : ""}
          />
        </>
      )}
    </section>
  );
}

