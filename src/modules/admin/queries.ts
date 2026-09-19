import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { getDb } from "@/db";
import { adminRoles } from "@/db/schema";
import { readQueueCounts } from "@/infrastructure/queue/queues";
import { readRedisHealth } from "@/infrastructure/queue/redis";
import { AppError } from "@/lib/http/errors";
import type { AdminActor } from "./access";
import { getAnalyticsSummary } from "@/modules/analytics/events";

export const adminSections = ["users", "sites", "founders", "categories", "technologies", "countries", "queues", "jobs", "failed-jobs",
  "performance", "badges", "claims", "payments", "orders", "products", "ads", "ad-inventory", "ad-reservations", "emails", "analytics", "health", "audit", "settings"] as const;
export type AdminSection = typeof adminSections[number];
export const adminSectionSchema = z.enum(adminSections);
// Queries are static projections. Never SELECT * or return recipients, token
// hashes, signed URLs, webhook bodies, queue payloads, or provider secrets.
const reports: Partial<Record<AdminSection, { table: string; order: string; columns: string; where?: string }>> = {
  users: { table: "users", order: "id", columns: "id,name,is_pro,created_at" },
  sites: { table: "sites", order: "id", columns: "id,slug,name,lifecycle,is_listed,monitoring_paused,current_score,owner_id" },
  founders: { table: "founders", order: "id", columns: "id,slug,name,visibility,country_code" },
  categories: { table: "categories", order: "id", columns: "id,slug,name,active" },
  technologies: { table: "technologies", order: "id", columns: "id,slug,name,active" },
  countries: { table: "countries", order: "code", columns: "code,name" },
  jobs: { table: "background_jobs", order: "id", columns: "id,queue,kind,status,attempts,max_attempts,last_error_code,available_at,site_id,correlation_id" },
  "failed-jobs": { table: "background_jobs", order: "id", columns: "id,queue,kind,status,attempts,last_error_code,updated_at", where: "status='failed'" },
  performance: { table: "speed_tests", order: "id", columns: "id,site_id,score,strategy,lcp_ms,tbt_ms,tested_at" },
  badges: { table: "site_awards", order: "id", columns: "id,site_id,achievement_id,period_id,awarded_at" },
  claims: { table: "site_claims", order: "id", columns: "id,site_id,user_id,method,status,attempts,expires_at" },
  payments: { table: "payment_ledger", order: "id", columns: "id,order_id,user_id,site_id,amount_cents,currency,status,occurred_at" },
  orders: { table: "checkout_orders", order: "id", columns: "id,user_id,site_id,product_id,status,created_at" },
  products: { table: "products", order: "id", columns: "id,key,title,kind,amount_cents,currency,billing_interval,entitlement_days,active" },
  ads: { table: "ad_slots", order: "id", columns: "id,position,order_index,name,user_id,status,is_active,expires_at" },
  "ad-inventory": { table: "ad_inventory", order: "id", columns: "id,position,order_index,active" },
  "ad-reservations": { table: "ad_reservations", order: "id", columns: "id,inventory_id,order_id,user_id,site_id,ad_slot_id,status,starts_at,ends_at,created_at" },
  emails: { table: "email_deliveries", order: "id", columns: "id,user_id,template,status,attempts,last_error_code,accepted_at,created_at" },
  audit: { table: "audit_logs", order: "id", columns: "id,actor_user_id,action,target_type,target_id,reason,created_at" },
};

export async function getAdminReport(actor: AdminActor, section: AdminSection, cursor?: string) {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Administration is temporarily unavailable.", 503);
  const [role] = await db.select().from(adminRoles).where(eq(adminRoles.userId, actor.userId));
  if (!role || (role.role === "moderator" && !["sites", "founders", "categories", "technologies", "countries", "claims", "badges", "performance"].includes(section))) {
    throw new AppError("FORBIDDEN", "Your role does not allow this report.", 403);
  }
  if (section === "settings") {
    const env = getEnv();
    return { rows: [{ site: env.SITE_URL, payments: env.PAYMENTS_ENABLED, email: env.EMAIL_ENABLED,
      storage: env.STORAGE_ENABLED, analytics: env.ANALYTICS_ENABLED, screenshots: env.SCREENSHOTS_ENABLED,
      scheduler: env.SCHEDULER_ENABLED }], nextCursor: null };
  }
  if (section === "health") {
    const redis = await readRedisHealth();
    return { rows: [{ database: "reachable", redis: redis.ready ? "ready" : redis.reason }], nextCursor: null };
  }
  if (section === "queues") {
    let transport: Awaited<ReturnType<typeof readQueueCounts>> = {};
    try { transport = await readQueueCounts(); } catch { /* Ledger remains visible during Redis outages. */ }
    const rows = await db.execute(sql`SELECT queue,status,count(*)::int AS count FROM background_jobs GROUP BY queue,status ORDER BY queue,status`);
    return { rows: rows.map((row) => ({ ...row, transport: transport[String(row.queue)] ?? { unavailable: true } })), nextCursor: null };
  }
  if (section === "analytics") {
    return { rows: await getAnalyticsSummary(), nextCursor: null };
  }
  const report = reports[section];
  if (!report) throw new AppError("NOT_FOUND", "Report not found.", 404);
  if (cursor && (cursor.length > 100 || !/^[a-zA-Z0-9-]+$/.test(cursor))) throw new AppError("INVALID_REQUEST", "Invalid report cursor.", 400);
  // Cast only the parameter, preserving indexed native key ordering.
  const kind = section === "ads" ? "integer" : section === "countries" ? "text" : "uuid";
  if (cursor && ((kind === "uuid" && !z.uuid().safeParse(cursor).success) || (kind === "integer" && !/^\d{1,10}$/.test(cursor)))) throw new AppError("INVALID_REQUEST", "Invalid report cursor.", 400);
  const clauses = [report.where ? sql.raw(report.where) : sql`true`, cursor ? sql`${sql.identifier(report.order)} > ${cursor}::${sql.raw(kind)}` : sql`true`];
  const rows = await db.execute(sql`SELECT ${sql.raw(report.columns)} FROM ${sql.identifier(report.table)} WHERE ${clauses[0]} AND ${clauses[1]}
    ORDER BY ${sql.identifier(report.order)} ASC LIMIT 51`);
  const visible = rows.slice(0, 50).map((row) => ({ ...row }));
  return { rows: visible, nextCursor: rows.length > 50 ? String(visible.at(-1)?.[report.order]) : null };
}
