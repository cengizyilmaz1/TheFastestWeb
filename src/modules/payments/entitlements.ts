import { sql, type SQL } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { AppError } from "@/lib/http/errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Connection = Database | Transaction;
type Expression = SQL | string;

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Account access is temporarily unavailable.", 503);
  return db;
}

/** e is always a local entitlement alias, never supplied by a request. */
const active = () => sql`e.kind='PRO' AND e.status='active' AND e.starts_at<=now() AND (e.ends_at IS NULL OR e.ends_at>now())`;

function accountScope(userId: Expression) {
  return sql`e.user_id=${userId} AND e.site_id IS NULL AND (
    (e.source='legacy' AND e.source_id='user:'||${userId}::text)
    OR (e.source='dodo' AND EXISTS (
      SELECT 1 FROM checkout_orders o WHERE o.user_id=e.user_id AND o.site_id IS NULL
        AND o.product_snapshot->>'scope'='account' AND o.product_snapshot->>'requiresSite'='false'
        AND o.product_snapshot->>'kind'='pro_listing'
        AND (EXISTS (SELECT 1 FROM payment_ledger p WHERE p.order_id=o.id AND
          (e.source_id='payment:'||p.provider_payment_id OR e.source_id='subscription:'||p.provider_subscription_id))
          OR EXISTS (SELECT 1 FROM payment_events pe WHERE pe.order_id=o.id AND pe.processed_at IS NOT NULL
            AND pe.type LIKE 'subscription.%' AND e.source_id='subscription:'||pe.resource_id))
    )))`;
}

/** Immutable checkout scope prevents ON DELETE SET NULL broadening site access. */
export function accountProPredicate(userId: Expression, legacyIsPro: SQL | boolean = false) {
  return sql`(${legacyIsPro} OR EXISTS (SELECT 1 FROM entitlements e WHERE ${active()} AND ${accountScope(userId)}))`;
}

/** Site grants stay with their purchased site and buyer; they never cover new sites. */
export function siteProPredicate(siteId: Expression, ownerId: Expression | null, legacyTier: SQL | string = "free") {
  return sql`(${legacyTier}='pro'
    OR EXISTS (SELECT 1 FROM users u WHERE u.id=${ownerId} AND ${accountProPredicate(sql`u.id`, sql`u.is_pro`)})
    OR EXISTS (SELECT 1 FROM entitlements e WHERE ${active()} AND e.site_id=${siteId}
      AND ((e.source='legacy' AND e.source_id='site:'||${siteId}::text)
        OR (e.source='dodo' AND e.user_id=${ownerId}))))`;
}

/** Paid discovery placement is explicit and never contributes to a score or rank. */
export function activeSitePlacementPredicate(kind: "FEATURED" | "SPONSORSHIP", siteId: Expression, ownerId: Expression | null) {
  const productKind = kind === "FEATURED" ? "featured_listing" : "sponsorship";
  return sql`EXISTS (SELECT 1 FROM entitlements e WHERE e.kind=${kind} AND e.source='dodo' AND e.status='active'
    AND e.starts_at<=now() AND (e.ends_at IS NULL OR e.ends_at>now()) AND e.site_id=${siteId} AND e.user_id=${ownerId}
    AND EXISTS (SELECT 1 FROM checkout_orders o WHERE o.user_id=e.user_id AND o.site_id=e.site_id
      AND o.product_snapshot->>'scope'='site' AND o.product_snapshot->>'requiresSite'='true' AND o.product_snapshot->>'kind'=${productKind}
      AND (EXISTS (SELECT 1 FROM payment_ledger p WHERE p.order_id=o.id
        AND (e.source_id='payment:'||p.provider_payment_id OR e.source_id='subscription:'||p.provider_subscription_id))
        OR EXISTS (SELECT 1 FROM payment_events pe WHERE pe.order_id=o.id AND pe.processed_at IS NOT NULL
          AND pe.type LIKE 'subscription.%' AND e.source_id='subscription:'||pe.resource_id))))`;
}

export async function hasAccountProAccess(userId: string, legacyIsPro?: boolean, connection?: Connection): Promise<boolean> {
  const db = connection ?? database();
  if (legacyIsPro === undefined) {
    const [user] = await db.execute<{ is_pro: boolean }>(sql`SELECT is_pro FROM users WHERE id=${userId}`);
    legacyIsPro = user?.is_pro ?? false;
  }
  if (legacyIsPro) return true;
  // With a transaction this lock serializes a concurrent grant revocation until
  // the authorized operation commits. Callers lock/recheck the account as well.
  const rows = await db.execute(sql`SELECT e.id FROM entitlements e WHERE ${active()} AND ${accountScope(userId)}
    LIMIT 1 ${connection ? sql`FOR SHARE OF e` : sql``}`);
  return rows.length > 0;
}

export async function hasSiteProAccess(siteId: string, connection?: Connection): Promise<boolean> {
  const db = connection ?? database();
  const [row] = await db.execute<{ allowed: boolean }>(sql`SELECT ${siteProPredicate(sql`s.id`, sql`s.owner_id`, sql`s.tier`)} AS allowed FROM sites s WHERE s.id=${siteId}`);
  return row?.allowed ?? false;
}
