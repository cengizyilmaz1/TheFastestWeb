"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative min-[769px]:hidden" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-bg-card text-text-secondary cursor-pointer transition-colors hover:bg-bg-card-hover hover:text-text-primary"
        aria-label="Menu"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[180px] bg-bg-main border border-border rounded-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden z-50 animate-fade-in-up">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[0.85rem] font-medium text-text-secondary no-underline hover:bg-bg-card hover:text-text-primary transition-colors"
          >
            Leaderboard
          </Link>
          <Link
            href="/test"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[0.85rem] font-medium text-text-secondary no-underline hover:bg-bg-card hover:text-text-primary transition-colors"
          >
            Test Speed
          </Link>
          <Link
            href="/pricing"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[0.85rem] font-medium text-text-secondary no-underline hover:bg-bg-card hover:text-text-primary transition-colors"
          >
            Pricing
          </Link>
          <div className="h-px bg-border" />
          <Link href="/categories" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-[0.85rem] font-medium text-text-secondary no-underline hover:bg-bg-card hover:text-text-primary transition-colors">Categories</Link>
          <Link
            href="/submit"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[0.85rem] font-semibold text-accent no-underline hover:bg-bg-card transition-colors"
          >
            Submit Site
          </Link>
        </div>
      )}
    </div>
  );
}
