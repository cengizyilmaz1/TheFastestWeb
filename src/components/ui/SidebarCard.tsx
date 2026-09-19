"use client";

import { AdSlot } from "@/db/schema";
import Image from "next/image";
import { ArrowUpRightIcon } from "@phosphor-icons/react";

interface SidebarCardProps {
  slot: AdSlot;
}

/** A sold sponsor spot. Compact, so six fit a rail; it sits flat and only lifts on hover. */
export function SidebarCard({ slot }: SidebarCardProps) {
  function handleClick() {
    navigator.sendBeacon(
      "/api/ad-click",
      new Blob([JSON.stringify({ id: slot.id })], { type: "application/json" })
    );
  }

  return (
    <a
      href={slot.url}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={handleClick}
      className="group block min-h-[86px] rounded-[18px] border border-border bg-bg-main p-3 no-underline transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-text-primary hover:shadow-panel active:scale-[.98]"
    >
      <span className="flex items-center gap-2.5">
        {slot.faviconUrl ? (
          <span data-theme="light" className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-bg-main shadow-[inset_0_0_0_1px_var(--line)]">
            <Image unoptimized width={40} height={40} src={slot.faviconUrl} alt="" className="h-5 w-5 rounded-[4px] object-contain" />
          </span>
        ) : (
          <span aria-hidden className="monogram h-8 w-8 rounded-[10px] text-[13px]">{slot.name.trim().charAt(0).toUpperCase()}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-text-primary">{slot.name}</span>
        <ArrowUpRightIcon size={13} aria-hidden className="flex-none text-text-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary" />
      </span>
      <span className="mt-2 line-clamp-2 text-xs leading-snug text-text-muted">{slot.tagline}</span>
    </a>
  );
}
