"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint { score: number; testedAt: string }
type TimeRange = "7d" | "30d" | "90d" | "all";

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

function CustomTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload: DataPoint }[] }) {
  if (!active || !payload?.[0]) return null;
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

export function HistoryPlot({ data, range, spanMonths, yDomain }: { data: DataPoint[]; range: TimeRange; spanMonths: boolean; yDomain: number[] }) {
  return (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                isAnimationActive={false}
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
  );
}
