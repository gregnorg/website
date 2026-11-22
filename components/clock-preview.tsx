import { formatClock } from "@/lib/format-clock";

export function ClockPreview({ mine, opponent }: { mine: string | null; opponent: string | null }) {
  if (mine === null || opponent === null) return null;

  return <span className="clock-preview">
    <span>Your clock <strong>{formatClock(Number(mine))}</strong></span>
    <span>Opponent <strong>{formatClock(Number(opponent))}</strong></span>
  </span>;
}
