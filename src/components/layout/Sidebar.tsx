import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { SidebarCard } from "@/components/ui/SidebarCard";
import type { AdSlot } from "@/db/schema";

export const RAIL_SPOTS = 6;

/**
 * A sponsor rail of six spots, shown from 2xl. Sold spots come first in their purchased order; the rest are
 * open spots that lead to the plans page. Advertising stays labelled and quieter than the content column.
 */
export function Sidebar({ position, adSlots = [] }: { position: "left" | "right"; adSlots?: AdSlot[] }) {
  const slots = adSlots.filter((slot) => slot.position === position).sort((a, b) => a.orderIndex - b.orderIndex).slice(0, RAIL_SPOTS);
  const open = Array.from({ length: RAIL_SPOTS - slots.length }, (_, index) => slots.length + index + 1);
  return <aside aria-label={position + " sponsors"} className="hidden px-3 pb-10 pt-8 2xl:block">
    <div className="sticky top-24 max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain pb-2 [scrollbar-width:none]">
      <div className="flex items-center justify-between gap-2 px-1 pb-2.5"><p className="text-xs font-medium text-text-muted">Sponsors</p><Link href="/pricing" className="text-xs font-semibold text-text-secondary underline decoration-brand decoration-2 underline-offset-4 hover:text-text-primary">Advertise</Link></div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {slots.map((slot) => <li key={slot.id}><SidebarCard slot={slot} /></li>)}
        {open.map((spot) => <li key={spot}><Link href="/pricing" aria-label={`Sponsor spot ${spot} is open. See plans`} className="group flex min-h-[86px] items-center gap-3 rounded-[18px] border border-dashed border-border-light px-3 no-underline transition-[background-color,border-color,transform] duration-200 hover:border-text-primary hover:bg-bg-main active:scale-[.98]">
          <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-bg-card text-text-muted transition-colors group-hover:bg-brand group-hover:text-on-brand"><PlusIcon size={16} weight="bold" /></span>
          <span className="min-w-0"><span className="block text-[13px] font-semibold leading-tight text-text-secondary transition-colors group-hover:text-text-primary">Open spot</span><span className="stat-value mt-1 block text-[11px] text-text-muted">{String(spot).padStart(2, "0")} of {String(RAIL_SPOTS).padStart(2, "0")}</span></span>
        </Link></li>)}
      </ul>
    </div>
  </aside>;
}
