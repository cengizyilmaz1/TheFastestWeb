"use client";

import { useState } from "react";
import { MetricInfoTip } from "@/components/ui/MetricInfoTip";

interface MetricsGridProps {
  fcp: string | null;
  lcp: string | null;
  cls: string | null;
  tbt: string | null;
  tti: string | null;
  si: string | null;
  label?: string;
}

function parseMs(val: string): number | null {
  if (!val || val === "N/A") return null;
  const sMatch = val.match(/([\d.]+)\s*s/);
  if (sMatch) return parseFloat(sMatch[1]) * 1000;
  const msMatch = val.match(/([\d.]+)\s*ms/);
  if (msMatch) return parseFloat(msMatch[1]);
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCls(val: string): number | null {
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : null;
}

// Google Core Web Vitals thresholds
function cwvStatus(metric: "lcp" | "cls", val: string): "pass" | "warn" | "fail" | "unknown" {
  if (!val || val === "N/A") return "unknown";
  if (metric === "lcp") {
    const ms = parseMs(val);
    if (ms === null) return "unknown";
    if (ms <= 2500) return "pass";
    if (ms <= 4000) return "warn";
    return "fail";
  }
  if (metric === "cls") {
    const v = parseCls(val);
    if (v === null) return "unknown";
    if (v <= 0.1) return "pass";
    if (v <= 0.25) return "warn";
    return "fail";
  }
  return "warn";
}

const statusConfig = {
  unknown: { label: "Unavailable", dotClass: "bg-text-muted", textClass: "text-text-muted", bgClass: "bg-bg-elevated" },
  pass: { label: "Good", dotClass: "bg-green", textClass: "text-green", bgClass: "bg-green-dim" },
  warn: { label: "Needs Work", dotClass: "bg-orange", textClass: "text-orange", bgClass: "bg-orange-dim" },
  fail: { label: "Poor", dotClass: "bg-red", textClass: "text-red", bgClass: "bg-red-dim" },
};

export function MetricsGrid({ fcp, lcp, cls, tbt, tti, si, label }: MetricsGridProps) {
  const [showAll, setShowAll] = useState(false);

  const lcpStatus = cwvStatus("lcp", lcp || "");
  const clsStatus = cwvStatus("cls", cls || "");

  const lcpCfg = statusConfig[lcpStatus];
  const clsCfg = statusConfig[clsStatus];

  return (
    <div>
      <h3 className="font-display font-bold text-[1.05rem] mb-3.5">
        {label || "Core Web Vitals"}
      </h3>

      {/* Primary: LCP + CLS */}
      <div className="grid grid-cols-2 gap-3 mb-3 max-[640px]:grid-cols-1">
        <div className="bg-bg-card border border-border rounded-[12px] p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="text-[0.72rem] font-semibold text-text-muted uppercase tracking-[0.06em] font-mono">
                LCP
              </div>
              <MetricInfoTip metric="LCP" />
            </div>
            <div className={`text-[0.68rem] font-semibold px-2 py-0.5 rounded ${lcpCfg.bgClass} ${lcpCfg.textClass}`}>
              {lcpCfg.label}
            </div>
          </div>
          <div className={`font-mono font-[800] text-[1.4rem] ${lcpCfg.textClass}`}>
            {lcp || "N/A"}
          </div>
          <div className="text-[0.72rem] text-text-muted mt-1">
            Largest Contentful Paint — should be under 2.5s
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-[12px] p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="text-[0.72rem] font-semibold text-text-muted uppercase tracking-[0.06em] font-mono">
                CLS
              </div>
              <MetricInfoTip metric="CLS" />
            </div>
            <div className={`text-[0.68rem] font-semibold px-2 py-0.5 rounded ${clsCfg.bgClass} ${clsCfg.textClass}`}>
              {clsCfg.label}
            </div>
          </div>
          <div className={`font-mono font-[800] text-[1.4rem] ${clsCfg.textClass}`}>
            {cls || "N/A"}
          </div>
          <div className="text-[0.72rem] text-text-muted mt-1">
            Cumulative Layout Shift — should be under 0.1
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setShowAll(!showAll)}
        className="text-[0.78rem] text-text-muted hover:text-text-secondary font-medium cursor-pointer bg-transparent border-none font-body transition-colors mb-3"
      >
        {showAll ? "Hide details" : "Show all metrics"} {showAll ? "↑" : "↓"}
      </button>

      {/* Secondary: FCP, TBT, TTI, SI */}
      {showAll && (
        <div className="grid grid-cols-4 gap-2.5 max-[640px]:grid-cols-2 animate-fade-in-up">
          {[
            { label: "FCP", value: fcp, desc: "First Contentful Paint" },
            { label: "TBT", value: tbt, desc: "Total Blocking Time" },
            { label: "TTI", value: tti, desc: "Time to Interactive" },
            { label: "SI", value: si, desc: "Speed Index" },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-bg-card border border-border rounded-[10px] p-3 text-center relative"
            >
              <div className="absolute top-2 right-2">
                <MetricInfoTip metric={m.label} />
              </div>
              <div className="text-[0.68rem] font-semibold text-text-muted uppercase tracking-[0.06em] mb-1 font-mono">
                {m.label}
              </div>
              <div className="font-mono font-bold text-[0.95rem] text-text-primary">
                {m.value || "N/A"}
              </div>
              <div className="text-[0.62rem] text-text-muted mt-0.5">{m.desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
