"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { METRIC_INFO } from "@/lib/metric-info";

interface MetricInfoTipProps {
  metric: string;
}

export function MetricInfoTip({ metric }: MetricInfoTipProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const info = METRIC_INFO[metric];

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const tooltipWidth = 230;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    // Keep tooltip within viewport
    if (left < 8) left = 8;
    if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    let top: number;
    if (spaceBelow < 180) {
      // Show above
      top = rect.top + window.scrollY - 8;
    } else {
      // Show below
      top = rect.bottom + window.scrollY + 8;
    }
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        tooltipRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }

    function handleScroll() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  if (!info) return null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open) updatePosition();
          setOpen(!open);
        }}
        className="w-[18px] h-[18px] rounded-full border border-border-light text-text-muted flex items-center justify-center cursor-pointer bg-transparent hover:text-accent hover:border-accent transition-colors"
        aria-label={`Tips for ${metric}`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="5" cy="2" r="0.8" fill="currentColor" />
          <rect x="4.2" y="3.5" width="1.6" height="4.5" rx="0.8" fill="currentColor" />
        </svg>
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] w-[230px] bg-bg-elevated border border-border-light rounded-[10px] p-3 text-left shadow-lg animate-fade-in-up"
          style={{ top: pos.top, left: pos.left, position: "absolute" }}
        >
          <div className="text-[0.72rem] font-semibold text-text-primary mb-1">{info.name}</div>
          <div className="text-[0.65rem] text-green font-mono font-semibold mb-1.5">
            Target: {info.good}
          </div>
          <div className="text-[0.65rem] text-text-secondary leading-[1.5]">{info.tip}</div>
        </div>,
        document.body
      )}
    </>
  );
}
