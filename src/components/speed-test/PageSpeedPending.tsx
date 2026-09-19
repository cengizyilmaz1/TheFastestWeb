"use client";

import { useEffect, useState } from "react";
import { InstrumentKeyframes } from "@/components/speed-test/InstrumentKeyframes";

interface PageSpeedPendingProps {
  title?: string;
  detail?: string;
  /** The address being measured. */
  target?: string;
}

const two = (value: number) => String(value).padStart(2, "0");

/** The status line of a running measurement: what is happening, a stopwatch, and a needle scanning the rule. */
export function PageSpeedPending({ title = "Waiting for PageSpeed measurement", detail = "Results may take a minute.", target }: PageSpeedPendingProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <InstrumentKeyframes />
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
        <div role="status" aria-live="polite" className="min-w-0">
          <h2 className="flex items-center gap-3 text-xl font-semibold tracking-[-.03em] sm:text-2xl"><span aria-hidden className="animate-pulse-dot h-2 w-2 shrink-0 rounded-full bg-brand" />{title}</h2>
          {target && <p className="mt-1.5 [overflow-wrap:anywhere] text-sm text-text-secondary">{target}</p>}
          <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-text-muted">{detail}</p>
        </div>
        {/* A stopwatch for sighted users; it stays out of the live region so it is not announced every second. */}
        <p aria-hidden className="stat-value text-3xl font-medium leading-none text-text-primary sm:text-4xl">{two(Math.floor(elapsed / 60))}:{two(elapsed % 60)}</p>
      </div>
      <div aria-hidden className="relative mt-7 overflow-hidden pt-3">
        <div className="tick-rule" />
        <div className="absolute inset-0 motion-safe:animate-[tfw-scan_2.2s_cubic-bezier(.45,0,.55,1)_infinite_alternate]"><span className="absolute left-0 top-0 h-full w-[3px] origin-bottom -skew-x-[18deg] rounded-sm bg-brand shadow-[0_0_14px_var(--brand-fill)]" /></div>
      </div>
    </div>
  );
}
