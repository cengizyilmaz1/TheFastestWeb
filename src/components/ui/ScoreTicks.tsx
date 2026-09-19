import type { CSSProperties } from "react";

/** A 0-100 score drawn as filled ticks on a rule. Decorative: always pair it with the numeric score. */
export function ScoreTicks({ score, className = "" }: { score: number | null | undefined; className?: string }) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const band = value >= 90 ? "good" : value >= 50 ? "mid" : "poor";
  return <span aria-hidden className={"score-ticks " + className} data-band={band} style={{ "--score": value } as CSSProperties} />;
}

export function scoreTone(score: number | null | undefined, measured = true) {
  if (!measured || score == null) return "text-text-muted";
  return score >= 90 ? "text-green" : score >= 50 ? "text-orange" : "text-red";
}
