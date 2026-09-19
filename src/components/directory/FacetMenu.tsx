"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";

export type FacetOption = { label: string; href: string; selected?: boolean; count?: number; category?: string };

/**
 * One facet of the directory as a pill that opens a list of links. Every option is a URL the server built,
 * so choosing one is a navigation: shareable, and the back button walks it.
 */
export function FacetMenu({ label, value, options, icon, align = "left", searchable = options.length > 8, highlight = Boolean(value) }: { label: string; value?: string; options: FacetOption[]; icon?: ReactNode; align?: "left" | "right"; searchable?: boolean; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const panel = useId();
  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const anchor = container.current, menu = dropdown.current;
      if (!anchor || !menu) return;
      const rect = anchor.getBoundingClientRect(), list = menu.querySelector("ul");
      const height = list ? menu.offsetHeight - list.offsetHeight + Math.min(list.scrollHeight, 300) : menu.offsetHeight;
      const safeTop = Math.max(12, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0) + 8;
      const below = Math.max(0, window.innerHeight - rect.bottom - 20);
      const above = Math.max(0, rect.top - safeTop - 8);
      const upwards = below < height && above > below;
      const preferredLeft = align === "right" ? rect.right - menu.offsetWidth : rect.left;
      const left = Math.max(12, Math.min(preferredLeft, document.documentElement.clientWidth - menu.offsetWidth - 12));
      menu.style.left = `${left - rect.left}px`;
      menu.style.right = "auto";
      menu.style.top = upwards ? "auto" : "calc(100% + 8px)";
      menu.style.bottom = upwards ? "calc(100% + 8px)" : "auto";
      menu.style.maxHeight = `${upwards ? above : below}px`;
      menu.style.transformOrigin = `${upwards ? "bottom" : "top"} ${align}`;
    }
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!container.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const visible = term ? options.filter((option) => option.label.toLowerCase().includes(term.toLowerCase())) : options;
  return <div ref={container} className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={panel} onClick={() => { setOpen(!open); setTerm(""); }}
      className={"inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-medium transition-colors " + (highlight ? "border-text-primary bg-bg-main text-text-primary" : "border-border bg-bg-main text-text-secondary hover:border-text-muted hover:text-text-primary")}>
      {icon}<span>{label}</span>{value && <span className={"max-w-[150px] truncate border-l border-border-light pl-2 font-semibold" + (label === "Sort" ? " max-[399px]:sr-only" : "")}>{value}</span>}
      <CaretDownIcon size={12} weight="bold" className={"text-text-muted transition-transform " + (open ? "rotate-180" : "")} aria-hidden />
    </button>
    {open && <div ref={dropdown} id={panel} className={"animate-modal-in absolute top-[calc(100%+8px)] z-40 flex w-[min(264px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] border border-border bg-bg-main p-1.5 shadow-pop " + (align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left")}>
      {searchable && <label className="relative mb-1 flex shrink-0 items-center"><span className="sr-only">Find in {label.toLowerCase()}</span><MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-3 text-text-muted" aria-hidden /><input autoFocus type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder={"Find " + label.toLowerCase()} className="h-10 w-full rounded-[14px] bg-bg-card pl-9 pr-3 text-sm outline-none! placeholder:text-text-muted" /></label>}
      <ul className="min-h-0 max-h-[300px] overflow-y-auto overscroll-contain">
        {visible.map((option) => <li key={option.href + option.label}><Link href={option.href} scroll={false} aria-current={option.selected ? "true" : undefined} data-category={option.category} onClick={() => setOpen(false)}
          className={"flex min-h-10 items-center gap-2.5 rounded-[14px] px-3 text-sm no-underline transition-colors hover:bg-bg-card " + (option.selected ? "font-semibold text-text-primary" : "text-text-secondary hover:text-text-primary")}>
          {option.category && <span aria-hidden className="accent-dot" />}<span className="min-w-0 flex-1 truncate">{option.label}</span>
          {option.count !== undefined && <span className="stat-value text-xs text-text-muted">{option.count}</span>}
          {option.selected && <CheckIcon size={14} weight="bold" aria-hidden />}
        </Link></li>)}
        {visible.length === 0 && <li className="px-3 py-4 text-[13px] text-text-muted">Nothing matches “{term}”.</li>}
      </ul>
    </div>}
  </div>;
}
