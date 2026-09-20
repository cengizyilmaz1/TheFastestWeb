import { AdCTA } from "@/components/ui/AdCTA";
import { SidebarCard } from "@/components/ui/SidebarCard";
import type { PublicAdSlot } from "@/components/ads/types";

interface SidebarProps {
  position: "left" | "right";
  count?: number;
  adSlots?: PublicAdSlot[];
}

export function Sidebar({ position, count = 5, adSlots = [] }: SidebarProps) {
  const side = position === "left" ? "left-0" : "right-0";
  const rowCount = Math.max(count, ...["left", "right"].map((side) => adSlots.filter((slot) => slot.position === side).length));
  const slotsForPosition = adSlots.filter((s) => s.position === position).sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  const rows: (PublicAdSlot | undefined)[] = Array.from({ length: rowCount });
  const legacyOverflow: PublicAdSlot[] = [];
  for (const slot of slotsForPosition) {
    if (Number.isInteger(slot.orderIndex) && slot.orderIndex >= 0 && slot.orderIndex < rowCount && !rows[slot.orderIndex]) {
      rows[slot.orderIndex] = slot;
    } else {
      legacyOverflow.push(slot);
    }
  }
  // Historical duplicate coordinates must not hide an existing advertisement.
  for (const slot of legacyOverflow) rows[rows.findIndex((row) => !row)] = slot;

  return (
    <aside
      aria-label={`${position === "left" ? "Left" : "Right"} advertising`}
      style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
      className={`fixed top-0 ${side} w-[190px] h-dvh overflow-hidden p-2 grid gap-2 z-[110] max-[1100px]:hidden`}
    >
      {rows.map((slot, index) => slot
        ? <SidebarCard key={slot.id} slot={slot} />
        : <AdCTA key={`empty-${index}`} position={position} />)}
    </aside>
  );
}
