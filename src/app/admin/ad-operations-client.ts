export type InventoryRow = { id: string; position: "left" | "right"; order_index: number; active: boolean };
export type ReservationRow = { id: string; inventory_id: string; order_id: string; user_id: string; site_id: string | null;
  ad_slot_id: number | null; status: string; starts_at: string | null; ends_at: string | null; created_at: string };
export type AdRow = { id: number; position: "left" | "right"; order_index: number; name: string;
  user_id: string | null; status: string; is_active: boolean; expires_at: string | null };
type Reports = { "ad-inventory": InventoryRow; "ad-reservations": ReservationRow; ads: AdRow };
export type AdReport<T> = { rows: T[]; nextCursor: string | null };
export type AdAction = { action: "ad.inventory"; inventoryId: string; position: "left" | "right"; orderIndex: number; active: boolean; reason: string }
  | { action: "ad.approve"; reservationId: string; reason: string };
export type AdPreview = { before: Record<string, unknown> | null; proposed: AdAction; token: string; expiresAt: string; financialMutation: false };

/** A review candidate still requires the server's current payment and ownership checks. */
export function canReviewCreative(reservation: { status: string; ends_at?: string | null },
  creative?: { status?: string; is_active?: boolean }, now = Date.now()) {
  if (reservation.ends_at && !(new Date(reservation.ends_at).getTime() > now)) return false;
  if (creative?.status === "active" && creative.is_active === true) return false;
  return reservation.status === "paid" || reservation.status === "active"
    && (creative?.status === "pending" || creative?.is_active === false);
}

async function read<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Advertisement administration is temporarily unavailable.");
  return result as T;
}

export async function loadAdReport<K extends keyof Reports>(section: K, cursor?: string): Promise<AdReport<Reports[K]>> {
  return read(await fetch(`/api/admin/report?section=${section}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    { cache: "no-store", signal: AbortSignal.timeout(15_000) }));
}

export async function previewAdAction(action: AdAction): Promise<AdPreview> {
  return read(await fetch("/api/admin/actions", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "preview", action }), signal: AbortSignal.timeout(20_000) }));
}

export async function confirmAdAction(preview: AdPreview): Promise<{ auditId: string; after: Record<string, unknown> | null }> {
  if (!preview.token) throw new Error("Preview the advertisement change before confirming it.");
  return read(await fetch("/api/admin/actions", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "confirm", action: preview.proposed, token: preview.token }), signal: AbortSignal.timeout(30_000) }));
}

export function safeCreativeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
