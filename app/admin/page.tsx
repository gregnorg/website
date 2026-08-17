import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { deleteAccount, deleteIdleGames } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };

export default async function AdminPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const [users, idleGames, audit] = await Promise.all([
    pool.query<{ id: string; username: string; email: string; role: string; created_at: Date; games: number }>(
      `SELECT u.id, u.username, u.email, u.role, u."createdAt" AS created_at,
              count(DISTINCT gp.game_id)::int AS games
       FROM "user" u LEFT JOIN game_players gp ON gp.user_id = u.id
       GROUP BY u.id ORDER BY lower(u.username)`,
    ),
    pool.query<{ id: string; game_type: string; status: string; updated_at: Date; players: string }>(
      `SELECT g.id, g.game_type, g.status, g.updated_at,
              string_agg(u.username, ' vs ' ORDER BY gp.mark) AS players
       FROM games g JOIN game_players gp ON gp.game_id = g.id JOIN "user" u ON u.id = gp.user_id
       WHERE g.updated_at < now() - interval '30 days'
       GROUP BY g.id ORDER BY g.updated_at`,
    ),
    pool.query<{ admin_username: string; action: string; target_label: string | null; created_at: Date }>(
      `SELECT admin_username, action, target_label, created_at
       FROM admin_audit_log ORDER BY created_at DESC LIMIT 20`,
    ),
  ]);

  return (
    <section className="page admin-page">
      <div className="page-heading"><h1>Admin</h1><span className="status">{users.rowCount} / 50 players</span></div>
      {params.error && <p className="error admin-message">{params.error}</p>}
      {params.success && <p className="success admin-message">{params.success}</p>}

      <h2>Players</h2>
      <div className="admin-list">
        {users.rows.map((user) => <article className="admin-card" key={user.id}>
          <div><strong>{user.username}</strong>{user.role.includes("admin") && <span className="status">Admin</span>}<p>{user.email} · {user.games} games · joined {user.created_at.toLocaleDateString()}</p></div>
          {user.id !== admin.id && <form action={deleteAccount} className="admin-delete-form">
            <input type="hidden" name="userId" value={user.id} />
            <input name="confirmation" aria-label={`Type ${user.username} to confirm`} placeholder={`Type ${user.username}`} required />
            <button className="danger-button">Delete account</button>
          </form>}
        </article>)}
      </div>

      <h2>Idle games</h2>
      <form action={deleteIdleGames} className="admin-cleanup-form">
        <label>Idle for at least<input name="days" type="number" min="1" max="365" defaultValue="30" required /></label>
        <label className="checkbox-label"><input name="includeActive" type="checkbox" /> Include active games</label>
        <button className="danger-button">Delete matching games</button>
      </form>
      <div className="admin-list">
        {idleGames.rows.length === 0 ? <p>No games have been idle for 30 days.</p> : idleGames.rows.map((game) => <article className="admin-card" key={game.id}><div><strong>{game.players}</strong><p>{game.game_type} · {game.status} · last active {game.updated_at.toLocaleDateString()}</p></div></article>)}
      </div>

      <h2>Recent admin activity</h2>
      <div className="admin-list">{audit.rows.length === 0 ? <p>No admin actions yet.</p> : audit.rows.map((entry, index) => <article className="admin-card" key={`${entry.created_at.toISOString()}-${index}`}><div><strong>{entry.admin_username}: {entry.action}</strong><p>{entry.target_label} · {entry.created_at.toLocaleString()}</p></div></article>)}</div>
    </section>
  );
}
