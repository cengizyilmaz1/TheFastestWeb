"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { InfoIcon } from "@phosphor-icons/react";
import { METRIC_INFO } from "@/lib/metric-info";

interface MetricInfoTipProps {
  metric: string;
}

const TOOLTIP_WIDTH = 264;

export function MetricInfoTip({ metric }: MetricInfoTipProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const tooltipId = useId();
  const info = METRIC_INFO[metric];

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    // Keep the tooltip within the viewport.
    if (left + TOOLTIP_WIDTH > window.innerWidth - 8) left = window.innerWidth - TOOLTIP_WIDTH - 8;
    if (left < 8) left = 8;

    const above = window.innerHeight - rect.bottom < 200;
    setPos({ top: (above ? rect.top - 8 : rect.bottom + 8) + window.scrollY, left, above });
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

    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  if (!info) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          setOpen(!open);
        }}
        className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-transparent text-text-muted transition-[background-color,color,transform] duration-150 before:absolute before:-inset-2 before:content-[''] hover:bg-bg-card-hover hover:text-text-primary active:scale-90 aria-expanded:bg-text-primary aria-expanded:text-bg-main"
        aria-label={`Tips for ${metric}`}
        aria-expanded={open}
        aria-controls={open ? tooltipId : undefined}
      >
        <InfoIcon size={16} weight={open ? "fill" : "regular"} aria-hidden />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="status"
          className={"absolute z-[9999] " + (pos.above ? "-translate-y-full" : "")}
          style={{ top: pos.top, left: pos.left, width: TOOLTIP_WIDTH }}
        >
          <div className="panel animate-modal-in rounded-xl p-4 text-left shadow-pop">
            <p className="text-sm font-semibold leading-snug text-text-primary">{info.name}</p>
            <p className="mt-2 flex items-baseline justify-between gap-3 border-y border-border py-2 text-[13px] text-text-secondary">Target<span className="stat-value font-medium text-green">{info.good}</span></p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-text-secondary">{info.tip}</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
