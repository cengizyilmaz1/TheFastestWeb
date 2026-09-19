"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

function formatXTick(iso: string, range: TimeRange, spanMonths: boolean): string {
  const d = new Date(iso);
  if (range === "7d") return d.toLocaleDateString("en-US", { weekday: "short" });
  if (range === "all" && spanMonths)
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTooltipDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: DataPoint }[] }) {
  if (!active || !payload?.[0]?.payload) return null;
  const { score, testedAt } = payload[0].payload;
  return (
    <div className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 shadow-lg">
      <div className="font-mono font-bold text-[0.88rem] text-text-primary">
        {score}/100
      </div>
      <div className="text-[0.68rem] text-text-muted">
        {formatTooltipDate(testedAt)}
      </div>
    </div>
  );
}

export function HistoryChart({ data, currentScore, trend }: HistoryChartProps) {
  const [range, setRange] = useState<TimeRange>("30d");

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
          <div className="flex gap-1 bg-bg-elevated rounded-lg p-0.5 shrink-0">
            {ranges.map((r) => (
              <button
                key={r.key}
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

      <div style={{ width: "100%", height: filtered.length < 2 ? 120 : 200 }}>
        {filtered.length < 2 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-[0.82rem] font-mono">
            {currentScore}/100 — daily retests will build the chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={filtered} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="testedAt"
                tickFormatter={(v) => formatXTick(v, range, spanMonths)}
                tick={{ fill: "var(--color-text-muted)", fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                minTickGap={40}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: "var(--color-text-muted)", fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
                axisLine={false}
                tickLine={false}
                tickMargin={4}
                width={36}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: "var(--color-border-light)", strokeDasharray: "4 3" }}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#F59E0B"
                strokeWidth={2.5}
                fill="url(#scoreGradient)"
                dot={{ r: 3, fill: "#F59E0B", stroke: "var(--color-bg-card)", strokeWidth: 1 }}
                activeDot={{ r: 5, fill: "#F59E0B", stroke: "var(--color-bg-card)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
