import Link from "next/link";

const pushfightPreview = [
  ["invalid", "invalid", "empty", "empty", "black-square", "empty", "empty", "invalid"],
  ["empty", "empty", "white-anchor", "white-circle", "white-square", "black-circle", "empty", "empty"],
  ["empty", "empty", "empty", "white-circle", "black-circle", "empty", "empty", "black-square"],
  ["invalid", "empty", "empty", "white-square", "black-square", "empty", "invalid", "invalid"],
];

export default function Home() {
  return (
    <section className="center hero">
      <h1>It’s okay to be pushy.</h1>
      <div className="actions"><Link className="button" href="/signup">Create an account</Link><Link href="/login">Log in</Link></div>
      <div className="home-pushfight" role="img" aria-label="Pushfight board with black and white pieces">
        {pushfightPreview.flatMap((row, rowIndex) => row.map((cell, colIndex) => (
          <span key={`${rowIndex}-${colIndex}`} className={`home-pf-cell${cell === "invalid" ? " home-pf-hole" : ""}`}>
            {cell !== "empty" && cell !== "invalid" ? (
              <span className={`pf-piece ${cell.endsWith("circle") ? "circle-piece" : "square-piece"} ${cell.startsWith("white") ? "white-piece" : "black-piece"}${cell.endsWith("anchor") ? " anchor-piece" : ""}`} />
            ) : null}
          </span>
        )))}
      </div>
    </section>
  );
}
