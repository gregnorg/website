import Link from "next/link";

export default function Home() {
  return (
    <section className="center hero">
      <p className="kicker">Play when you have time.</p>
      <h1>Simple, turn-based games with friends.</h1>
      <p>Create an account, start a game, and take your turn. Try Tic-tac-toe or Pushfight.</p>
      <div className="actions"><Link className="button" href="/signup">Create an account</Link><Link href="/login">Log in</Link></div>
      <div className="preview" aria-label="Tic-tac-toe board preview">
        {["X", "", "O", "", "X", "", "O", "", "X"].map((cell, index) => <span key={index}>{cell}</span>)}
      </div>
    </section>
  );
}
