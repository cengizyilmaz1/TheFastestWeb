import { AdCTA } from "@/components/ui/AdCTA";
import { SidebarCard } from "@/components/ui/SidebarCard";
import type { AdSlot } from "@/db/schema";

interface SidebarProps {
  position: "left" | "right";
  count?: number;
  adSlots?: AdSlot[];
}

export function Sidebar({ position, count = 5, adSlots = [] }: SidebarProps) {
  const side = position === "left" ? "left-0" : "right-0";
  const slotsForPosition = adSlots.filter((s) => s.position === position);
  const emptyCount = count - slotsForPosition.length;

  return (
    <aside
      className={`fixed top-0 ${side} w-[190px] h-screen overflow-hidden p-2 flex flex-col gap-2 z-[110] max-[1100px]:hidden`}
    >
      {slotsForPosition.map((slot) => (
        <SidebarCard key={slot.id} slot={slot} />
      ))}
      {Array.from({ length: Math.max(0, emptyCount) }).map((_, i) => (
        <AdCTA key={`empty-${i}`} position={position} />
      ))}
    </aside>
  );
}
