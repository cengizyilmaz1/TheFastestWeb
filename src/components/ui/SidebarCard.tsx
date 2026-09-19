"use client";

import { AdSlot } from "@/db/schema";
import Image from "next/image";

interface SidebarCardProps {
  slot: AdSlot;
}

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
      className="block rounded-xl border border-border bg-bg-main p-4 no-underline transition-colors hover:border-border-light"
    >
      <div className="[perspective:400px] shrink-0 mb-1.5">
        {slot.faviconUrl ? (
          <Image
            unoptimized
            width={40}
            height={40}
            src={slot.faviconUrl}
            alt=""
            className="h-10 w-10 rounded-lg object-contain bg-white p-1"
          />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-bg-elevated flex items-center justify-center text-sm font-bold text-text-muted">
            {slot.name[0]}
          </div>
        )}
      </div>
      <div className="font-bold text-[0.78rem] text-text-primary mb-0.5 font-display leading-tight truncate w-full">
        {slot.name}
      </div>
      <div className="mt-1 text-xs text-text-secondary leading-relaxed line-clamp-3">
        {slot.tagline}
      </div>
    </a>
  );
}
