"use client";

import { useState, useMemo, useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { scoreTone } from "@/components/ui/ScoreTicks";

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
  if (range === "7d") return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  if (range === "all" && spanMonths)
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatTooltipDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC", timeZoneName: "short",
  });
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: DataPoint }[] }) {
  if (!active || !payload?.[0]?.payload) return null;
  const { score, testedAt } = payload[0].payload;
  return (
    <div className="panel rounded-xl px-3.5 py-2.5 shadow-pop">
      <p className={"stat-value text-lg font-medium leading-none " + scoreTone(score)}>
        {score}<span className="ml-0.5 text-xs font-normal text-text-muted">/100</span>
      </p>
      <p className="mt-1.5 text-xs text-text-secondary">{formatTooltipDate(testedAt)}</p>
    </div>
  );
}

const axisTick = { fill: "var(--color-text-muted)", fontSize: 11, fontFamily: "var(--font-geist-mono)" };

export function HistoryChart({ data, currentScore, trend }: HistoryChartProps) {
  const [range, setRange] = useState<TimeRange>("all");
  const gradientId = "score-area-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const filtered = useMemo(() => filterByRange(data, range), [data, range]);

  const spanMonths = useMemo(() => {
    if (filtered.length < 2) return false;
    // Month labels only once the series is long enough that days would crowd the axis.
    const first = new Date(filtered[0].testedAt).getTime();
    const last = new Date(filtered[filtered.length - 1].testedAt).getTime();
    return last - first > 120 * 24 * 60 * 60 * 1000;
  }, [filtered]);

  // One label per month on long series, placed at the month's first result, so no label repeats.
  const monthTicks = useMemo(() => {
    if (range !== "all" || !spanMonths) return undefined;
    const seen = new Set<string>();
    return filtered.filter((d) => { const month = d.testedAt.slice(0, 7); if (seen.has(month)) return false; seen.add(month); return true; }).map((d) => d.testedAt);
  }, [filtered, range, spanMonths]);

  const yDomain = useMemo(() => {
    if (filtered.length === 0) return [0, 100];
    const scores = filtered.map((d) => d.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const lo = Math.max(0, Math.floor((min - 3) / 5) * 5);
    const hi = Math.min(100, Math.ceil((max + 3) / 5) * 5);
    return [lo, hi];
  }, [filtered]);

  const ranges: { key: TimeRange; label: string; name: string }[] = [
    { key: "7d", label: "7D", name: "Last 7 days" },
    { key: "30d", label: "30D", name: "Last 30 days" },
    { key: "90d", label: "90D", name: "Last 90 days" },
    { key: "all", label: "All", name: "All recorded results" },
  ];

  const showGoodLine = yDomain[0] < 90 && yDomain[1] > 90;
  const sparse = filtered.length <= 40;
  const TrendIcon = trend >= 0 ? TrendUpIcon : TrendDownIcon;

  return (
    <div className="panel @container min-w-0 p-5 sm:p-7">
      {/* The range control drops under the readout in narrow panels, so two charts side by side stay level. */}
      <div className="flex flex-col gap-x-6 gap-y-4 @2xl:flex-row @2xl:items-end @2xl:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] text-text-muted">Latest recorded score</p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className={"stat-value text-3xl font-medium leading-none " + scoreTone(currentScore)}>
              {currentScore}<span className="ml-1 text-sm font-normal text-text-muted">/100</span>
            </span>
            {trend !== 0 && (
              <span className={"inline-flex items-center gap-1.5 text-[13px] " + (trend >= 0 ? "text-green" : "text-red")}>
                <TrendIcon size={16} weight="bold" aria-hidden />
                <span><span className="sr-only">{trend >= 0 ? "Up " : "Down "}</span><span className="stat-value font-medium">{Math.abs(trend)}%</span> since first recorded result</span>
              </span>
            )}
          </p>
        </div>
        {data.length > 1 && (
          <div role="group" aria-label="Time range" className="flex shrink-0 gap-1.5">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                aria-label={r.name}
                onClick={() => setRange(r.key)}
                className="chip min-h-9 min-w-11 justify-center px-3 text-xs! font-semibold! active:scale-95"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6" style={{ width: "100%", height: filtered.length < 2 ? 140 : 240 }}>
        {filtered.length < 2 ? (
          <div className="dot-grid flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border-light px-5 text-center">
            <p className="text-sm font-semibold text-text-primary">{filtered.length === 0 ? "No recorded results in this time range" : "One recorded result so far"}</p>
            <p className="mt-1 max-w-[44ch] text-[13px] text-text-secondary">{filtered.length === 0 ? "Choose a longer range to see earlier measurements." : range === "all" ? "The line appears once a second measurement is recorded." : "Choose a longer range, or wait for the next measurement."}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={filtered} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-fill)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--brand-fill)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="testedAt"
                ticks={monthTicks}
                tickFormatter={(v) => formatXTick(v, range, spanMonths)}
                tick={axisTick}
                axisLine={{ stroke: "var(--color-border-light)" }}
                tickLine={false}
                tickMargin={10}
                minTickGap={56}
              />
              <YAxis
                domain={yDomain}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                tickMargin={6}
                width={36}
              />
              {showGoodLine && <ReferenceLine y={90} stroke="var(--color-green)" strokeDasharray="2 5" strokeOpacity={0.9} ifOverflow="hidden" />}
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: "var(--color-text-muted)", strokeWidth: 1 }}
                wrapperStyle={{ outline: "none", zIndex: 10 }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="var(--color-text-primary)"
                strokeWidth={sparse ? 2 : 1.5}
                strokeLinejoin="round"
                fill={`url(#${gradientId})`}
                dot={sparse ? { r: 3, fill: "var(--color-bg-main)", stroke: "var(--color-text-primary)", strokeWidth: 1.5 } : false}
                activeDot={{ r: 5, fill: "var(--brand-fill)", stroke: "var(--color-text-primary)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {showGoodLine && filtered.length >= 2 && (
        <p className="mt-4 flex items-center gap-2.5 text-xs text-text-muted">
          <span aria-hidden className="w-6 border-t-2 border-dotted border-green" />
          <span>The dotted line marks <span className="stat-value text-text-secondary">90</span>, where the good band starts.</span>
        </p>
      )}
    </div>
  );
}
