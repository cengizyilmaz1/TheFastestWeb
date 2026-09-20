import type { AdSlot } from "@/db/schema";

/** Fields allowed to cross into public advertisement components. */
export type PublicAdSlot = Pick<
  AdSlot,
  "id" | "position" | "orderIndex" | "name" | "url" | "tagline" | "faviconUrl"
>;
