import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { tournamentFeed } from "@/lib/tournament-live";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await auth.api.getSession({ headers: await headers() })) return new Response(null, { status: 401 });
  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false;
      let previous = "";
      let unsubscribe = () => {};
      let timeout: ReturnType<typeof setTimeout>;
      close = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timeout);
        unsubscribe();
        request.signal.removeEventListener("abort", close);
        try { controller.close(); } catch { /* The consumer may already have canceled. */ }
      };
      if (request.signal.aborted) { close(); return; }
      request.signal.addEventListener("abort", close, { once: true });
      unsubscribe = tournamentFeed.subscribe(({ version, frames }) => {
        if (stopped) return;
        // Disconnect slow consumers instead of allowing their queues to grow.
        if ((controller.desiredSize ?? 0) <= 0) { close(); return; }
        if (frames.length) controller.enqueue(encoder.encode(`event: preview\ndata: ${JSON.stringify(frames)}\n\n`));
        if (version !== previous) {
          controller.enqueue(encoder.encode(`data: ${version}\n\n`));
          previous = version;
        }
      });
      timeout = setTimeout(close, 60000);
    },
    cancel() { close(); },
  }, { highWaterMark: 65536, size: chunk => chunk.byteLength });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "private, no-cache, no-transform", "X-Accel-Buffering": "no",
  } });
}
