import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function GamesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return (
    <section className="page">
      <div className="page-heading"><div><p className="kicker">Your games</p><h1>Games</h1></div><button className="button">New game</button></div>
      <div className="empty"><h2>No games yet</h2><p>Start a game and invite a friend by username.</p></div>
    </section>
  );
}
