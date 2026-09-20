import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adSlots } from "@/db/schema";

/** An audited owner campaign is a narrow exception; paid ads stay sponsored. */
export async function getPublicAdSlots() {
  const db = getDb();
  if (!db) return [];
  // Explicit identifiers preserve correlation when Drizzle renders a
  // single-table projection containing subqueries with their own id columns.
  const adId = sql`${sql.identifier("ad_slots")}.${sql.identifier("id")}`;
  const adUserId = sql`${sql.identifier("ad_slots")}.${sql.identifier("user_id")}`;
  const adUrl = sql`${sql.identifier("ad_slots")}.${sql.identifier("url")}`;
  const adName = sql`${sql.identifier("ad_slots")}.${sql.identifier("name")}`;
  const adExpiry = sql`${sql.identifier("ad_slots")}.${sql.identifier("expires_at")}`;
  return db.select({ id: adSlots.id, position: adSlots.position, orderIndex: adSlots.orderIndex,
    name: adSlots.name, url: adSlots.url, tagline: adSlots.tagline, faviconUrl: adSlots.faviconUrl,
    ownerPromotion: sql<boolean>`(${adSlots.name}='IndieTools' AND ${adSlots.url}='https://www.indietools.app/'
      AND ${adSlots.position}='right' AND ${adSlots.orderIndex}=0 AND ${adSlots.expiresAt} IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ad_reservations r WHERE r.ad_slot_id=${adId})
      AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.action='ad.owner_promotion.created' AND a.target_type='ad_slot'
        AND a.target_id=${adId}::text AND a.actor_user_id=${adUserId}
        AND a.payload->>'campaign'='indietools-launch-30d' AND a.payload->>'linkPolicy'='follow'
        AND a.payload->>'url'=${adUrl} AND a.payload->>'name'=${adName}
        AND a.payload->'expiresAtEpoch'=to_jsonb(extract(epoch FROM ${adExpiry}))
        AND ${adExpiry}<=a.created_at+interval '30 days 1 minute'))`,
  }).from(adSlots).where(and(eq(adSlots.isActive, true), eq(adSlots.status, "active"),
    or(isNull(adSlots.expiresAt), gt(adSlots.expiresAt, new Date()))));
}
