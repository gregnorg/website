import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
export const dynamic = "force-dynamic";

type PreviewFrame = { id: string; game_id: string; base_move_count: number; board: unknown };

// Bounded streams reconnect automatically. Each query releases its DB connection.
export async function GET(request: Request) {
  if (!await auth.api.getSession({ headers: await headers() })) return new Response(null, { status: 401 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const stream = new ReadableStream({
    start(controller) {
      let previous = "";
      let ticks = 0;
      let cursors: Record<string, string> | null = null;
      const close = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        request.signal.removeEventListener("abort", close);
        controller.close();
      };
      request.signal.addEventListener("abort", close, { once: true });
      const poll = async () => {
        try {
          // Capture official state first, then read previews. A submitted turn
          // therefore cannot overtake its final provisional frames in the stream.
          const result = await pool.query<{ version: string }>(
            `SELECT md5(coalesce(string_agg(v,',' ORDER BY v),'')) AS version FROM (
              SELECT id::text||status||coalesce(winner_name,'') AS v FROM tournaments
              UNION ALL SELECT g.id::text||g.status||coalesce(g.draw_offer_id::text,'')||coalesce(max(m.id),0)::text
                FROM games g LEFT JOIN moves m ON m.game_id=g.id
                WHERE g.tournament_id IS NOT NULL GROUP BY g.id
            ) versions`);
          if (stopped) return;
          const previews = await pool.query<PreviewFrame>(cursors === null
            ? `SELECT id::text,game_id,base_move_count,board FROM (
                SELECT DISTINCT ON (p.game_id) p.* FROM tournament_move_previews p
                JOIN games g ON g.id=p.game_id WHERE g.status='active'
                ORDER BY p.game_id,p.id DESC) latest ORDER BY id`
            : `SELECT p.id::text,p.game_id,p.base_move_count,p.board
                FROM tournament_move_previews p
                WHERE p.id>COALESCE(($1::jsonb->>p.game_id::text)::bigint,0)
                  AND p.created_at>clock_timestamp()-interval '2 minutes'
                ORDER BY p.id LIMIT 200`, cursors === null ? [] : [JSON.stringify(cursors)]);
          if (stopped) return;
          if (previews.rows.length) {
            controller.enqueue(encoder.encode(`event: preview\ndata: ${JSON.stringify(previews.rows)}\n\n`));
            cursors ??= {};
            for (const row of previews.rows) cursors[row.game_id] = row.id;
          } else cursors ??= {};
          const version = result.rows[0].version;
          if (version !== previous) {
            controller.enqueue(encoder.encode(`data: ${version}\n\n`));
            previous = version;
          }
          if (++ticks >= 240) { close(); return; }
          timer = setTimeout(poll, 250);
        } catch { close(); }
      };
      void poll();
    },
    cancel() { stopped = true; clearTimeout(timer); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
  } });
}
