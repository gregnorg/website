"use server";
import { requireAdmin } from "@/lib/admin";
import { pool } from "@/lib/db";
import { seedBracket, doubleEliminationBracket } from "@/lib/tournament-bracket";
import { settleTournament } from "@/lib/tournaments";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function createTournament(data: FormData) {
    const admin = await requireAdmin();
    const name = String(data.get("name") ?? "").trim();
    const minutes = Number(data.get("minutes"));
    const delayInput = String(data.get("delaySeconds") ?? "10").trim();
    const delaySeconds = Number(delayInput);
    const format = String(data.get("format") ?? "single");
    if (format !== "single" && format !== "double") redirect("/admin?error=Choose+a+valid+tournament+format.");
    const ids = data.getAll("members").map(String);
    if (!delayInput || !Number.isSafeInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 2147483647 || !name || name.length > 100 || !Number.isInteger(minutes) || minutes < 1 || minutes > 35791394 || ids.length < 4 || ids.length > 8 || new Set(ids).size !== ids.length)
        redirect("/admin?error=Enter+a+name,+positive+whole+minutes,+a+nonnegative+whole-second+delay,+and+4–8+members.");
    const pairs = seedBracket(ids);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const members = await client.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) FOR SHARE', [ids]);
        if (members.rowCount !== ids.length)
            throw new Error("A selected member no longer exists.");
        const t = await client.query<{
            id: string;
        }>("INSERT INTO tournaments(name,minutes,created_by,delay_seconds,format) VALUES($1,$2,$3,$4,$5) RETURNING id", [name, minutes, admin.id, delaySeconds, format]);
        const id = t.rows[0].id;
        if (format === "double") {
            for (const match of doubleEliminationBracket(pairs))
                await client.query("INSERT INTO tournament_matches(tournament_id,round,slot,player1,player2,sources,bracket_label,reset_final) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [id, match.round, match.slot, ...match.players, match.sources ? JSON.stringify(match.sources) : null, match.label, match.reset]);
        }
        else for (let round = 0, count = pairs.length; count >= 1; round++, count /= 2) {
            for (let slot = 0; slot < count; slot++)
                await client.query("INSERT INTO tournament_matches(tournament_id,round,slot,player1,player2) VALUES($1,$2,$3,$4,$5)", [id, round, slot, round === 0 ? pairs[slot][0] : null, round === 0 ? pairs[slot][1] : null]);
        }
        await settleTournament(client, id);
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
    revalidatePath("/", "layout");
    redirect("/tournaments");
}
export async function cancelTournament(data: FormData) {
    await requireAdmin();
    const id = String(data.get("tournamentId") ?? "");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM tournaments WHERE id=$1 FOR UPDATE", [id]);
        const changed = await client.query("UPDATE tournaments SET status='cancelled',finished_at=now() WHERE id=$1 AND status='active'", [id]);
        if (changed.rowCount)
            await client.query("UPDATE games SET status='cancelled',draw_offered_by_id=NULL,draw_offer_id=NULL,updated_at=now() WHERE tournament_id=$1 AND status='active'", [id]);
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
    revalidatePath("/", "layout");
    redirect("/tournaments");
}
