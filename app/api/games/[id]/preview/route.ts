import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isChatOriginAllowed } from "@/lib/game-chat";
import { PreviewError, saveTournamentPreview } from "@/lib/tournament-preview";

export async function POST(request: Request, { params }: { params: Promise<{id: string}> }) {
  if (!isChatOriginAllowed(request)) return Response.json({error:"Invalid origin."}, {status:403});
  const session = await auth.api.getSession({headers:await headers()});
  if (!session) return Response.json({error:"Sign in to share moves."}, {status:401});
  const {id} = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Response.json({error:"Invalid game."}, {status:400});
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({error:"Invalid preview."}, {status:400});
  let body;
  try { body=JSON.parse(raw); } catch { return Response.json({error:"Invalid preview."}, {status:400}); }
  if (!Number.isSafeInteger(body?.baseMoveCount) || body.baseMoveCount < 0) return Response.json({error:"Invalid turn."}, {status:400});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await saveTournamentPreview(client,id,session.user.id,body.baseMoveCount,body.draft);
    await client.query("COMMIT");
    return Response.json({ok:true});
  } catch(error) {
    await client.query("ROLLBACK");
    if (error instanceof PreviewError) return Response.json({error:error.message}, {status:409});
    // Rule validation failures are malformed previews, not application failures.
    if (error instanceof Error && !("code" in error)) return Response.json({error:error.message}, {status:400});
    throw error;
  } finally { client.release(); }
}
