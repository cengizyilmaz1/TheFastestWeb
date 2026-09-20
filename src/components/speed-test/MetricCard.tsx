import { METRIC_INFO } from "@/lib/metric-info";
import { MetricInfoTip } from "@/components/ui/MetricInfoTip";

interface MetricCardProps {
  label: string;
  value: string;
  score: number | null; // 0-1; absent lab metrics do not become zero.
}

export function MetricCard({ label, value, score }: MetricCardProps) {
  const info = METRIC_INFO[label];

  const color =
    score === null ? "text-text-muted" : score >= 0.9
      ? "text-green"
      : score >= 0.5
        ? "text-accent-bright"
        : "text-red";

  return (
    <div className="bg-bg-card border border-border rounded-[10px] p-3.5 text-center relative">
      {info && (
        <div className="absolute top-2.5 right-2.5">
          <MetricInfoTip metric={label} />
        </div>
      )}
      <div className="text-[0.68rem] font-semibold text-text-muted uppercase tracking-[0.06em] mb-1 font-mono">
        {label}
      </div>
      <div className={`font-mono font-bold text-[1.1rem] ${color}`}>{value}</div>
    </div>
  );
}
