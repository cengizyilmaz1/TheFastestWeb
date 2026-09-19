"use client";

import { useEffect, useId, useRef } from "react";
import { scoreTone } from "@/components/ui/ScoreTicks";

interface SpeedGaugeProps {
  /** 0-100, or null while nothing has been measured yet. */
  score: number | null;
  /** The needle seeks across the scale while a measurement is running. */
  pending?: boolean;
  className?: string;
}

// A chronograph dial: a 240 degree scale that opens at the bottom, read clockwise from 0 to 100, numerals on the bezel.
const CX = 200, CY = 198, START = -210, SWEEP = 240;
// Tick paths overshoot the scale by half a tick so every dash is centred on its value.
const TICK = 0.3, SPAN = 100 + TICK;
const round = (value: number) => Math.round(value * 100) / 100;

function point(radius: number, value: number) {
  const angle = ((START + (SWEEP * value) / 100) * Math.PI) / 180;
  return [round(CX + radius * Math.cos(angle)), round(CY + radius * Math.sin(angle))] as const;
}

function arc(radius: number, from: number, to: number) {
  const [x1, y1] = point(radius, from), [x2, y2] = point(radius, to);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${((to - from) / 100) * SWEEP > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

const fineTicks = arc(164, -TICK / 2, 100 + TICK / 2), majorTicks = arc(159, -TICK / 2, 100 + TICK / 2);
const bands = [{ from: 0, to: 49.2, tone: "text-red" }, { from: 50, to: 89.2, tone: "text-orange" }, { from: 90, to: 100, tone: "text-green" }];
const numerals = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export function gaugeBand(score: number) {
  return score >= 90 ? "Good" : score >= 50 ? "Needs improvement" : "Poor";
}

export function SpeedGauge({ score, pending = false, className = "" }: SpeedGaugeProps) {
  const maskId = useId();
  const needle = useRef<SVGGElement>(null), reveal = useRef<SVGPathElement>(null), readout = useRef<SVGTextElement>(null);
  const measured = typeof score === "number" && Number.isFinite(score);
  const target = measured ? Math.max(0, Math.min(100, score)) : 0;
  const tone = scoreTone(target, measured);

  useEffect(() => {
    const paint = (value: number) => {
      if (needle.current) needle.current.style.transform = `rotate(${round((SWEEP * value) / 100)}deg)`;
      reveal.current?.setAttribute("stroke-dasharray", `${measured ? round(value + TICK) : 0} 400`);
      if (readout.current) readout.current.textContent = measured ? String(Math.round(value)) : "–";
    };
    if (!measured || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { paint(target); return; }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - started) / 1500, 1);
      paint(target * (1 - Math.pow(1 - progress, 4)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [measured, target]);

  return (
    <svg viewBox="0 0 400 308" role="img" aria-label={measured ? `Performance score ${Math.round(target)} out of 100. ${gaugeBand(target)}.` : pending ? "Performance score, measuring" : "Performance score, not measured yet"} className={"block h-auto w-full max-w-[460px] select-none " + className}>
      <style>{"@keyframes tfw-gauge-seek { from { transform: rotate(0deg); } to { transform: rotate(240deg); } }"}</style>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="308">
          <path ref={reveal} d={majorTicks} pathLength={SPAN} fill="none" stroke="white" strokeWidth="36" strokeDasharray="0 400" />
        </mask>
      </defs>

      {/* The scale: fine ticks every 2 points, long ticks every 10. */}
      <path d={fineTicks} pathLength={SPAN} fill="none" stroke="var(--line-strong)" strokeWidth="12" strokeDasharray={`${TICK} ${2 - TICK}`} />
      <path d={majorTicks} pathLength={SPAN} fill="none" stroke="var(--ink-muted)" strokeWidth="22" strokeDasharray={`${TICK} ${10 - TICK}`} />

      {/* The same ticks in the band colour, revealed up to the score. */}
      <g mask={`url(#${maskId})`} className={tone}>
        <path d={fineTicks} pathLength={SPAN} fill="none" stroke="currentColor" strokeWidth="12" strokeDasharray={`${TICK} ${2 - TICK}`} />
        <path d={majorTicks} pathLength={SPAN} fill="none" stroke="currentColor" strokeWidth="22" strokeDasharray={`${TICK} ${10 - TICK}`} />
      </g>

      {/* Score bands, like the red zone on a dial. */}
      {bands.map((band) => <path key={band.from} d={arc(141, band.from, band.to)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={band.tone} opacity={measured ? 0.9 : 0.45} />)}

      <g className="stat-value" fill="var(--ink-muted)" fontSize="12" textAnchor="middle">
        {numerals.map((mark) => { const [x, y] = point(187, mark); return <text key={mark} x={x} y={y + 4}>{mark}</text>; })}
      </g>

      <text ref={readout} x={CX} y={CY + 22} textAnchor="middle" fontSize={measured ? 88 : 60} fontWeight={measured ? 500 : 300} fill="currentColor" className={"stat-value " + tone}>{measured ? "0" : "–"}</text>
      <text x={CX} y={CY + 52} textAnchor="middle" fontSize="13" fill="var(--ink-muted)">out of 100</text>
      <text x={CX} y={CY + 92} textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor" className={measured ? tone : "text-text-muted"}>{measured ? gaugeBand(target) : pending ? "Measuring" : "Not measured yet"}</text>

      <g ref={needle} style={{ transformOrigin: `${CX}px ${CY}px` }}>
        <g className={pending ? "motion-safe:animate-[tfw-gauge-seek_2.2s_cubic-bezier(.45,0,.55,1)_infinite_alternate]" : undefined} style={{ transformOrigin: `${CX}px ${CY}px` }}>
          <polygon points="96,-2.8 176,-0.9 176,0.9 96,2.8" transform={`translate(${CX} ${CY}) rotate(${START})`} fill="var(--amber)" style={{ filter: "drop-shadow(0 0 7px color-mix(in srgb, var(--amber) 70%, transparent))" }} />
        </g>
      </g>
    </svg>
  );
}
