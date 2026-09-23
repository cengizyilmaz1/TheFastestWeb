"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

function ChartLoading() {
  return <div role="status" className="flex h-full items-center justify-center text-sm text-text-muted">Loading performance history…</div>;
}

const HistoryPlot = dynamic(() => import("./HistoryPlot").then(module => module.HistoryPlot), { ssr: false, loading: ChartLoading });

interface DataPoint {
  score: number;
  testedAt: string;
}

interface HistoryChartProps {
  data: DataPoint[];
  currentScore: number;
  trend: number;
}

type TimeRange = "7d" | "30d" | "90d" | "all";

function filterByRange(data: DataPoint[], range: TimeRange): DataPoint[] {
  if (range === "all") return data;
  const now = Date.now();
  const ms: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const cutoff = now - ms[range] * 24 * 60 * 60 * 1000;
  return data.filter((d) => new Date(d.testedAt).getTime() >= cutoff);
}

export function HistoryChart({ data, currentScore, trend }: HistoryChartProps) {
  const [range, setRange] = useState<TimeRange>("30d");
  const chartRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!chartRef.current) return;
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setVisible(true));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "100px" });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  const scoreClass =
    currentScore >= 97
      ? "text-green"
      : currentScore >= 94
        ? "text-accent-bright"
        : "text-orange";

  const trendClass = trend >= 0 ? "text-green" : "text-red";
  const trendArrow = trend >= 0 ? "\u2191" : "\u2193";

  const filtered = useMemo(() => filterByRange(data, range), [data, range]);

  const spanMonths = useMemo(() => {
    if (filtered.length < 2) return false;
    const first = new Date(filtered[0].testedAt);
    const last = new Date(filtered[filtered.length - 1].testedAt);
    return first.getFullYear() !== last.getFullYear() || first.getMonth() !== last.getMonth();
  }, [filtered]);

  const yDomain = useMemo(() => {
    if (filtered.length === 0) return [0, 100];
    const scores = filtered.map((d) => d.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const lo = Math.max(0, Math.floor((min - 3) / 5) * 5);
    const hi = Math.min(100, Math.ceil((max + 3) / 5) * 5);
    return [lo, hi];
  }, [filtered]);

  const ranges: { key: TimeRange; label: string }[] = [
    { key: "7d", label: "7D" },
    { key: "30d", label: "30D" },
    { key: "90d", label: "90D" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="bg-bg-card border border-border rounded-[14px] p-5 mb-7">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className={`font-mono font-[800] text-[1.7rem] max-[640px]:text-[1.3rem] ${scoreClass}`}>
            {currentScore}/100
          </div>
          {trend !== 0 && (
            <div className={`font-mono text-[0.82rem] font-semibold ${trendClass} whitespace-nowrap`}>
              {trendArrow} {Math.abs(trend)}% vs. prev
            </div>
          )}
        </div>
        {data.length > 1 && (
          <div role="group" aria-label="Performance history range" className="flex gap-1 bg-bg-elevated rounded-lg p-0.5 shrink-0">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
                className={`px-2.5 py-1 rounded-md text-[0.72rem] font-semibold transition-all duration-150 border-none ${
                  range === r.key
                    ? "bg-bg-card text-text-primary shadow-sm cursor-pointer"
                    : "text-text-muted hover:text-text-secondary bg-transparent cursor-pointer"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={chartRef} style={{ width: "100%", height: filtered.length < 2 ? 120 : 200 }}>
        {filtered.length < 2 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-[0.82rem] font-mono">
            {currentScore}/100 — daily retests will build the chart
          </div>
        ) : (
          visible ? <HistoryPlot data={filtered} range={range} spanMonths={spanMonths} yDomain={yDomain} /> : <ChartLoading />
        )}
      </div>
    </div>
  );
}
