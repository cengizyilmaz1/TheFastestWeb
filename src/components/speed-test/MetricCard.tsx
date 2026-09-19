import { METRIC_INFO } from "@/lib/metric-info";
import { ScoreTicks } from "@/components/ui/ScoreTicks";
import { SkeletonBar } from "@/components/speed-test/InstrumentKeyframes";

interface MetricCardProps {
  /** The metric's short code: FCP, LCP, CLS, TBT, TTI or SI. */
  label: string;
  value: string;
  score: number | null; // 0-1; null means the provider did not report this metric.
  name?: string;
  description?: string;
  /** "idle" before a run, "pending" while measuring. Defaults to a measured row. */
  state?: "idle" | "pending" | "measured";
}

/** One metric as a hairline row of a timing sheet: code, name, tick rule, value, and the target beneath it. Render it inside a <dl>. */
export function MetricCard({ label, value, score, name, description, state = "measured" }: MetricCardProps) {
  const info = METRIC_INFO[label];
  const rated = state === "measured" && score !== null;
  const tone = !rated ? "text-text-muted" : score >= 0.9 ? "text-green" : score >= 0.5 ? "text-orange" : "text-red";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-border py-4 sm:gap-x-6 md:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem]">
      <dt className="col-start-1 row-start-1 flex min-w-0 items-baseline">
        <abbr title={name ?? info?.name} className="w-12 shrink-0 text-xs font-bold text-text-muted no-underline font-stretch-[116%]">{label}</abbr>
        <span className="min-w-0 text-[15px] font-semibold leading-snug text-text-primary">{name ?? info?.name ?? label}</span>
      </dt>
      {description && <dd className="col-start-1 row-start-2 mt-1 pl-12 text-[13px] leading-snug text-text-muted">{description}</dd>}
      <dd className="col-start-2 row-span-2 row-start-1 hidden md:block"><ScoreTicks score={rated ? score * 100 : null} className={rated ? "" : "opacity-50"} /></dd>
      <dd className={"stat-value col-start-2 row-start-1 text-right text-[22px] font-medium leading-none sm:text-2xl md:col-start-3 " + tone}>
        {state === "pending" ? <><SkeletonBar className="ml-auto h-5 w-16" /><span className="sr-only">Measuring</span></> : state === "idle" ? "–" : score === null ? <span className="font-sans text-sm font-medium tracking-normal">Unavailable</span> : value}
      </dd>
      {info && <dd className="col-start-2 row-start-2 mt-1.5 whitespace-nowrap text-right text-xs text-text-muted md:col-start-3">Good: {info.good.toLowerCase()}</dd>}
    </div>
  );
}
