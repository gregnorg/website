import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
export const dynamic = "force-dynamic";
// Bounded streams reconnect automatically. Each query releases its DB connection.
export async function GET(request: Request) {
    if (!await auth.api.getSession({ headers: await headers() }))
        return new Response(null, { status: 401 });
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const stream = new ReadableStream({
        start(controller) {
            let previous = "";
            let ticks = 0;
            const close = () => { if (stopped)
                return; stopped = true; clearTimeout(timer); controller.close(); };
            request.signal.addEventListener("abort", close, { once: true });
            const poll = async () => {
                try {
                    const result = await pool.query<{
                        version: string;
                    }>(`SELECT md5(coalesce(string_agg(v,',' ORDER BY v),'')) AS version FROM (
            SELECT id::text||status||coalesce(winner_name,'') AS v FROM tournaments
            UNION ALL SELECT g.id::text||g.status||coalesce(g.draw_offer_id::text,'')||coalesce(max(m.id),0)::text FROM games g LEFT JOIN moves m ON m.game_id=g.id WHERE g.tournament_id IS NOT NULL GROUP BY g.id
          ) versions`);
                    if (stopped)
                        return;
                    const version = result.rows[0].version;
                    if (version !== previous) {
                        controller.enqueue(encoder.encode(`data: ${version}\n\n`));
                        previous = version;
                    }
                    if (++ticks >= 120) {
                        request.signal.removeEventListener("abort", close);
                        close();
                        return;
                    }
                    timer = setTimeout(poll, 500);
                }
                catch {
                    close();
                }
            };
            void poll();
        },
        cancel() { stopped = true; clearTimeout(timer); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
