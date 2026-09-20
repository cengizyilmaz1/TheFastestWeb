"use client";

import type { PublicAdSlot } from "@/components/ads/types";
import { OutboundLink } from "@/components/ui/OutboundLink";

interface SidebarCardProps {
  slot: PublicAdSlot;
}

export function SidebarCard({ slot }: SidebarCardProps) {
  return (
    <OutboundLink
      href={slot.url}
      placement="sidebar"
      trackingId={slot.id}
      rel={slot.ownerPromotion ? "noopener noreferrer" : "sponsored noopener noreferrer"}
      className="bg-bg-card border border-border rounded-[10px] px-2.5 py-2.5 text-center cursor-pointer transition-all duration-250 no-underline flex flex-col items-center justify-center flex-1 min-h-0 hover:bg-bg-card-hover hover:border-border-light hover:-translate-y-0.5"
    >
      <div className="[perspective:400px] shrink-0 mb-1.5">
        {slot.faviconUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={slot.faviconUrl}
            alt=""
            className="animate-coin-toss w-[40px] h-[40px] rounded-[8px] object-contain bg-white p-1"
          />
        ) : (
          <div className="animate-coin-toss w-[40px] h-[40px] rounded-[8px] bg-bg-elevated flex items-center justify-center text-[0.9rem] font-bold text-text-muted">
            {slot.name[0]}
          </div>
        )}
      </div>
      <div className="font-bold text-[0.78rem] text-text-primary mb-0.5 font-display leading-tight truncate w-full">
        {slot.name}
      </div>
      <div className="text-[0.62rem] text-text-muted leading-[1.3] line-clamp-2">
        {slot.tagline}
      </div>
    </OutboundLink>
  );
}
