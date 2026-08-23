import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { Board, EMPTY_BOARD } from "@/lib/game";
import { makeMove, resignGame } from "./actions";
import PushfightBoard from "@/components/pushfight-board";
import { applyMove, emptyBoard, movesSinceLastPush, normalizeMovePayload } from "@/lib/pushfight";
import { TicTacToeBoard } from "@/components/tic-tac-toe-board";
import { ConfirmResignButton } from "@/components/confirm-resign-button";
import {
  currentPlayerId as getCurrentPlayerId,
  isSetupPhase,
  summarizeTurns,
  type GameMove,
  type GameStatus,
  type GameType,
  type PlayerMark,
} from "@/lib/game-state";
import RefreshOnReturn from "@/components/refresh-on-return";
import { GameClocks } from "@/components/game-clocks";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; moved?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { id } = await params;
  const { error, moved } = await searchParams;

  const [gameResult, championResult] = await Promise.all([pool.query<{
    status: GameStatus;
    winner_id: string | null;
    resigned_by_id: string | null;
    game_type: GameType;
    my_mark: PlayerMark;
    opponent_username: string;
    opponent_id: string;
    x_player_id: string;
    o_player_id: string;
    time_control_seconds: number | null;
    my_time_remaining_ms: string | null;
    opponent_time_remaining_ms: string | null;
  }>(
    `SELECT g.status, g.winner_id, g.resigned_by_id, g.game_type, g.time_control_seconds,
            me.mark AS my_mark, me.time_remaining_ms AS my_time_remaining_ms,
            them.time_remaining_ms AS opponent_time_remaining_ms,
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
  ), pool.query<{ user_id: string }>("SELECT user_id FROM champion_state WHERE singleton = true")]);
  if (!gameResult.rowCount) notFound();
  const game = gameResult.rows[0];

  const isTicTacToe = game.game_type === "tic_tac_toe";
  const moves = await pool.query<GameMove>(
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
    for (const move of moves.rows) {
      if (move.position !== null && move.mark !== null) board[move.position] = move.mark;
    }
  }
  const xPlayerId = game.x_player_id;
  const oPlayerId = game.o_player_id;
  const turnSummary = summarizeTurns(moves.rows);
  const setupStage = isSetupPhase(game.game_type, turnSummary);
  const currentPlayerId = getCurrentPlayerId(game.game_type, xPlayerId, oPlayerId, turnSummary);
  const movesThisTurn = movesSinceLastPush(moves.rows);
  const canMove = game.status === "active" && currentPlayerId === session.user.id;
  const replayEnabled = game.status !== "active" || currentPlayerId !== game.opponent_id;
  const lastOpponentMoveIndex = moves.rows.findLastIndex((move) => move.player_id === game.opponent_id);
  const ticTacToeReplayPosition = isTicTacToe && lastOpponentMoveIndex >= 0
    ? moves.rows[lastOpponentMoveIndex].position
    : null;

  let pushfightBoard = emptyBoard();
  const pushfightReplayBoards: ReturnType<typeof emptyBoard>[] = [];
  if (!isTicTacToe) {
    for (let index = 0; index < moves.rows.length; index += 1) {
      const move = moves.rows[index];
      if (!move.payload) continue;
      try {
        const payload = normalizeMovePayload(move.payload);
        const moverColor = move.player_id === xPlayerId ? "white" : "black";
        if (index === lastOpponentMoveIndex) {
          pushfightReplayBoards.push(pushfightBoard);
          const actions = payload.type === "turn" ? payload.actions : [payload];
          let replayFrame = pushfightBoard;
          for (const replayAction of actions) {
            replayFrame = applyMove(replayFrame, replayAction, moverColor).board;
            pushfightReplayBoards.push(replayFrame);
          }
        }
        pushfightBoard = applyMove(pushfightBoard, payload, moverColor).board;
      } catch {
        // Ignore invalid historical moves for display and replay.
      }
    }
  }

  let nextTurnGameId: string | null = null;
  if (moved === "1") {
    const candidates = await pool.query<{
      id: string;
      game_type: GameType;
      x_player_id: string;
      o_player_id: string;
      move_count: number;
      setup_move_count: number;
      last_turn_player_id: string | null;
    }>(
      `SELECT g.id, g.game_type,
              xplayer.user_id AS x_player_id, oplayer.user_id AS o_player_id,
              COUNT(m.id)::int AS move_count,
              COUNT(m.id) FILTER (WHERE m.payload->>'type' = 'setup')::int AS setup_move_count,
              (ARRAY_AGG(m.player_id ORDER BY m.move_number DESC)
                FILTER (WHERE m.payload->>'type' IN ('push', 'turn')))[1] AS last_turn_player_id
         FROM games g
         JOIN game_players me
           ON me.game_id = g.id AND me.user_id = $1
         JOIN game_players xplayer
           ON xplayer.game_id = g.id AND xplayer.mark = 'X'
         JOIN game_players oplayer
           ON oplayer.game_id = g.id AND oplayer.mark = 'O'
         LEFT JOIN moves m ON m.game_id = g.id
        WHERE g.status = 'active' AND me.cleared_at IS NULL AND g.id <> $2
        GROUP BY g.id, xplayer.user_id, oplayer.user_id
        ORDER BY g.updated_at DESC`,
      [session.user.id, id],
    );
    nextTurnGameId = candidates.rows.find((candidate) => getCurrentPlayerId(
      candidate.game_type,
      candidate.x_player_id,
      candidate.o_player_id,
      {
        moveCount: candidate.move_count,
        setupMoveCount: candidate.setup_move_count,
        lastTurnPlayerId: candidate.last_turn_player_id,
      },
    ) === session.user.id)?.id ?? null;
  }

  let summary = `Waiting for ${game.opponent_username} to move.`;
  if (setupStage) {
    const teamName = turnSummary.setupMoveCount === 0 ? "White" : "Black";
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
    if (game.resigned_by_id === game.opponent_id) {
      summary = `${game.opponent_username} resigned. You won!`;
    } else if (game.resigned_by_id === session.user.id) {
      summary = `You resigned. ${game.opponent_username} won.`;
    } else {
      summary = game.winner_id === session.user.id
        ? "You won!"
        : `${game.opponent_username} won.`;
    }
  }

  const moveAction = makeMove;

  return (
    <section className="game-page">
      <RefreshOnReturn />
      {moved === "1" && (
        <div className="after-move" role="status">
          <span>Move submitted.</span>
          {nextTurnGameId ? <Link href={`/games/${nextTurnGameId}`}>Play your next game →</Link> : <Link href="/games">View all games</Link>}
        </div>
      )}
      <GameClocks
        gameId={id}
        myName={session.user.username ?? "You"}
        opponentName={game.opponent_username}
        myIsChampion={championResult.rows[0]?.user_id === session.user.id}
        opponentIsChampion={championResult.rows[0]?.user_id === game.opponent_id}
        myRemainingMs={Number(game.my_time_remaining_ms ?? 0)}
        opponentRemainingMs={Number(game.opponent_time_remaining_ms ?? 0)}
        canMove={canMove && !setupStage}
        opponentCanMove={!setupStage && game.status === "active" && currentPlayerId === game.opponent_id}
        myColor={game.my_mark === "X" ? "white" : "black"}
        timed={game.time_control_seconds !== null}
      />
      {game.game_type === "tic_tac_toe" ? (
        <>
          <p className="game-summary">{summary}</p>
          {error && <p className="error game-error" role="alert">{error}</p>}
          <p className="kicker">Tic-tac-toe</p>
          <TicTacToeBoard
            board={board}
            replayPosition={ticTacToeReplayPosition}
            replayEnabled={replayEnabled}
            gameId={id}
            canMove={canMove}
            action={moveAction}
          />
        </>
      ) : (
        <>
          <PushfightBoard
            key={moves.rows.length}
            board={pushfightBoard}
            gameId={id}
            myId={session.user.id}
            currentPlayerId={currentPlayerId}
            whitePlayerId={xPlayerId}
            blackPlayerId={oPlayerId}
            canMove={canMove}
            movesThisTurn={movesThisTurn}
            action={moveAction}
            isSetupPhase={setupStage}
            setupTeam={turnSummary.setupMoveCount === 0 ? "white" : "black"}
            setupTurnPlayerId={setupStage ? currentPlayerId : ""}
            statusMessage={summary}
            errorMessage={error}
            gameOutcome={game.status === "won" ? (game.winner_id === session.user.id ? "win" : "loss") : null}
            replayBoards={pushfightReplayBoards}
            replayEnabled={replayEnabled}
          />
        </>
      )}
      {game.status === "active" && (
        <form action={resignGame} className="resign-form">
          <input type="hidden" name="gameId" value={id} />
          <ConfirmResignButton />
        </form>
      )}
    </section>
  );
}
