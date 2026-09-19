import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { SidebarCard } from "@/components/ui/SidebarCard";
import type { AdSlot } from "@/db/schema";

export function Sidebar({ position, adSlots = [] }: { position: "left" | "right"; adSlots?: AdSlot[] }) {
  const slots = adSlots.filter((slot) => slot.position === position);
  return <aside aria-label={position + " sponsors"} className="hidden self-start px-3 py-10 2xl:block">
    <div className="sticky top-28 space-y-3">
      <p className="px-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">Supported by</p>
      {slots.map((slot) => <SidebarCard key={slot.id} slot={slot} />)}
      <Link href="/pricing" className="block rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary no-underline hover:border-border-light hover:text-text-primary">
        <ArrowUpRightIcon size={18} className="mb-3" aria-hidden />
        <span className="block font-medium">Your next audience is building here.</span>
        <span className="mt-2 block text-xs text-text-muted">Explore sponsorship</span>
      </Link>
    </div>
  </aside>;
}
