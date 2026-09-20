import { sql } from "drizzle-orm";
import { products } from "@/db/schema";
import { getEnv } from "@/config/env";

/** Managed packages cannot be sold using a stale or different-environment binding. */
export function verifiedCatalogPredicate() {
  return sql`(${products.key} NOT IN ('pro_lifetime','sidebar_ad_monthly') OR (
    SELECT a.payload->'state'->>'status'='synced' AND a.payload->'state'->>'providerProductId'=${products.providerProductId}
    FROM audit_logs a WHERE a.target_type='payment_catalog' AND a.target_id=(${`${getEnv().DODO_ENVIRONMENT ?? "unconfigured"}:`} || ${products.key})
    ORDER BY a.created_at DESC,a.id DESC LIMIT 1))`;
}
