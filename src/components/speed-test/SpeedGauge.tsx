"use client";

import { useEffect, useRef } from "react";

interface SpeedGaugeProps {
  score: number;
}

export function SpeedGauge({ score }: SpeedGaugeProps) {
  const fillRef = useRef<SVGCircleElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const circumference = 534;

  const scoreColor =
    score >= 90
      ? "var(--color-green)"
      : score >= 50
        ? "var(--color-accent-bright)"
        : "var(--color-red)";

  useEffect(() => {
    const fill = fillRef.current;
    const scoreEl = scoreRef.current;
    if (!fill || !scoreEl) return;

    // Reset
    fill.style.strokeDashoffset = String(circumference);

    // Animate gauge
    requestAnimationFrame(() => {
      const offset = circumference - (score / 100) * circumference;
      fill.style.strokeDashoffset = String(offset);
    });

    // Animate number
    const startTime = performance.now();
    const duration = 1500;
    function update(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      if (scoreEl) scoreEl.textContent = String(Math.round(score * eased));
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }, [score]);

  return (
    <div className="flex justify-center mb-7">
      <div className="relative w-[170px] h-[170px]">
        <svg
          className="w-full h-full"
          viewBox="0 0 200 200"
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx="100"
            cy="100"
            r="85"
            fill="none"
            stroke="var(--color-bg-card)"
            strokeWidth="10"
          />
          <circle
            ref={fillRef}
            cx="100"
            cy="100"
            r="85"
            fill="none"
            stroke={scoreColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            style={{ transition: "stroke-dashoffset 1.5s ease" }}
          />
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div
            ref={scoreRef}
            className="font-mono font-[800] text-[2.4rem] leading-none"
            style={{ color: scoreColor }}
          >
            0
          </div>
          <div className="text-[0.72rem] text-text-muted font-mono">/100</div>
        </div>
      </div>
    </div>
  );
}
