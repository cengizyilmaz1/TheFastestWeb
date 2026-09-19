import type { CSSProperties } from "react";
import { ScoreTicks, scoreTone } from "@/components/ui/ScoreTicks";
import { BAND_DOT, BAND_LABEL, scoreBand } from "./metric-bands";

const scale = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/**
 * The dominant readout of a report: the 0-100 score in tabular numerals over a filled tick rule.
 * `quiet` drops the band colour and weight, which is how the lower of two compared scores is shown.
 */
export function ScoreReadout({ score, quiet = false, compact = false }: { score: number | null | undefined; quiet?: boolean; compact?: boolean }) {
  const band = scoreBand(score);
  const size = compact ? "text-[clamp(4rem,7vw,6rem)]" : "text-[clamp(4.75rem,9.5vw,8.25rem)]";
  return <div>
    <div className="flex flex-wrap items-end gap-x-3 gap-y-4">
      <p className="flex items-end gap-2.5">
        <span className={"stat-value leading-[.8] tracking-[-.07em] " + size + " " + (band === null ? "font-extralight text-border-light" : quiet ? "font-normal text-text-secondary" : "font-medium " + scoreTone(score))}><span className="sr-only">{band === null ? "Score not recorded" : "Score "}</span>{band === null ? <span aria-hidden>—</span> : score}</span>
        <span className="stat-value pb-0.5 text-lg text-text-muted"><span className="sr-only">out of </span><span aria-hidden>/</span>100</span>
      </p>
      {band && <span className="chip ml-auto min-h-7 gap-2 text-xs"><span aria-hidden className={"h-1.5 w-1.5 rounded-full " + BAND_DOT[band]} />{BAND_LABEL[band]}</span>}
    </div>
    <div aria-hidden className="mt-6">
      <div className="relative -mx-3 h-6 overflow-hidden px-3">{band && <div className="needle-track relative h-full" style={{ "--score": score } as CSSProperties}><span className="absolute -right-px top-0 h-full w-[3px] origin-bottom -skew-x-[18deg] rounded-sm bg-brand shadow-[0_0_12px_var(--brand-fill)]" /></div>}</div>
      <ScoreTicks score={band === null ? null : score} className="h-6" />
      <div className="stat-value mt-2 flex justify-between text-[11px] text-text-muted">{scale.map((mark, index) => <span key={mark} className={"w-0 whitespace-nowrap first:w-auto last:w-auto [&:not(:first-child):not(:last-child)]:-translate-x-1/2 " + (index % 2 ? "hidden sm:block" : "")}>{mark}</span>)}</div>
    </div>
  </div>;
}
