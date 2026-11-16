import { pool } from "./db.ts";

export type PreviewFrame = { id: string; game_id: string; base_move_count: number; board: unknown };
type Update = { version: string; frames: PreviewFrame[] };
type Reader = (cursors: Record<string, string> | null) => Promise<Update>;

// One polling loop per process, regardless of how many SSE viewers are attached.
// It stops when the final viewer leaves and catches up afresh on reconnect.
export class TournamentFeed {
  private listeners = new Set<(update: Update) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private cursors: Record<string, string> | null = null;
  private latest = new Map<string, PreviewFrame>();
  private version: string | null = null;

  private read: Reader;

  constructor(read: Reader) { this.read = read; }

  subscribe(listener: (update: Update) => void) {
    this.listeners.add(listener);
    if (this.version !== null) listener({ version: this.version, frames: [...this.latest.values()] });
    if (this.listeners.size === 1) void this.poll(++this.generation);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        clearTimeout(this.timer);
        this.generation++;
        this.cursors = null;
        this.latest.clear();
        this.version = null;
      }
    };
  }

  private async poll(generation: number) {
    try {
      const update = await this.read(this.cursors);
      if (generation !== this.generation) return;
      const changed = update.version !== this.version;
      this.version = update.version;
      this.cursors ??= {};
      for (const frame of update.frames) {
        this.cursors[frame.game_id] = frame.id;
        this.latest.set(frame.game_id, frame);
      }
      if (changed || update.frames.length) {
        for (const listener of [...this.listeners]) {
          try { listener(update); } catch { this.listeners.delete(listener); }
        }
      }
    } catch (error) {
      console.error("Tournament live poll failed", error);
    } finally {
      if (generation === this.generation && this.listeners.size) {
        this.timer = setTimeout(() => void this.poll(generation), 250);
        this.timer.unref();
      }
    }
  }
}

async function readUpdate(cursors: Record<string, string> | null): Promise<Update> {
  // Official state is captured before previews so a submitted turn cannot
  // overtake its final provisional frames.
  const result = await pool.query<{ version: string }>(
    `SELECT md5(coalesce(string_agg(v,',' ORDER BY v),'')) AS version FROM (
      SELECT id::text||status||coalesce(winner_name,'') AS v FROM tournaments
        WHERE status='active' OR finished_at>now()-interval '24 hours'
      UNION ALL SELECT g.id::text||g.status||coalesce(g.draw_offer_id::text,'')||coalesce(max(m.id),0)::text
        FROM games g JOIN tournaments t ON t.id=g.tournament_id LEFT JOIN moves m ON m.game_id=g.id
        WHERE t.status='active' OR t.finished_at>now()-interval '24 hours' GROUP BY g.id
    ) versions`);
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
  return { version: result.rows[0].version, frames: previews.rows };
}

export const tournamentFeed = new TournamentFeed(readUpdate);
