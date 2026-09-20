import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adminRoles } from "@/db/schema";
import { readRedisHealth } from "@/infrastructure/queue/redis";
import { AppError } from "@/lib/http/errors";
import { accountProPredicate } from "@/modules/payments/entitlements";
import type { AdminActor } from "./access";

// Read models for the administrator panel. Every function rechecks the current
// database grant, so a revoked role cannot keep reading through a cached page.
// Projections are explicit: no token hashes, checkout URLs, webhook bodies,
// queue payloads or provider secrets. Account emails leave this module masked.

export const ADMIN_PAGE_SIZE = 25;
export type Paged<T> = { rows: T[]; total: number; page: number; pages: number };
export type DayPoint = { day: string; value: number };

async function fullAdminDb(actor: AdminActor) {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Administration is temporarily unavailable.", 503);
  const [grant] = await db.select({ role: adminRoles.role }).from(adminRoles)
    .where(and(eq(adminRoles.userId, actor.userId), eq(adminRoles.role, "admin"))).limit(1);
  if (!grant) throw new AppError("FORBIDDEN", "Administrator access is required.", 403);
  return db;
}

/** Keeps enough of an address to recognise an account without publishing it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "hidden";
  const local = email.slice(0, at), domain = email.slice(at + 1);
  return `${local.slice(0, local.length > 2 ? 2 : local.length - 1)}${"•".repeat(4)}@${domain}`;
}

export function pageNumber(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

/** Request text never becomes a pattern: LIKE wildcards are escaped. */
export function searchPattern(value: string | undefined): string | null {
  const text = (value ?? "").normalize("NFKC").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  return text ? `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%` : null;
}

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : typeof value === "string" ? new Date(value).toISOString() : null;
const paged = <T>(rows: T[], total: number, page: number): Paged<T> => ({ rows, total, page, pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) });

/** Dense daily series: days without rows are zero, not missing. */
function daily(rows: Iterable<Record<string, unknown>>, days: number): DayPoint[] {
  const values = new Map<string, number>();
  for (const row of rows) values.set(String(row.day), Number(row.value));
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today.getTime() - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    return { day, value: values.get(day) ?? 0 };
  });
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;
export async function getOverview(actor: AdminActor) {
  const db = await fullAdminDb(actor);
  const [[totals], signups, submissions, revenue, lifecycle, recentUsers, recentSites, audit, redis] = await Promise.all([
    db.execute(sql`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days') AS users_week,
      (SELECT count(*)::int FROM users u WHERE ${accountProPredicate(sql`u.id`, sql`u.is_pro`)}) AS pro_users,
      (SELECT count(*)::int FROM sites) AS sites,
      (SELECT count(*)::int FROM sites WHERE is_listed) AS sites_listed,
      (SELECT count(*)::int FROM sites WHERE created_at > now() - interval '7 days') AS sites_week,
      (SELECT count(*)::int FROM sites WHERE is_listed AND current_score >= 90) AS score_fast,
      (SELECT count(*)::int FROM sites WHERE is_listed AND current_score >= 50 AND current_score < 90) AS score_average,
      (SELECT count(*)::int FROM sites WHERE is_listed AND current_score < 50) AS score_slow,
      (SELECT count(*)::int FROM ad_slots WHERE is_active AND status='active' AND (expires_at IS NULL OR expires_at > now())) AS ads_active,
      (SELECT count(*)::int FROM ad_inventory WHERE active) AS ad_positions,
      (SELECT count(*)::int FROM ad_reservations WHERE status='paid') AS ads_to_review,
      (SELECT coalesce(sum(amount_cents),0)::int FROM payment_ledger WHERE status='succeeded' AND currency='USD' AND occurred_at > now() - interval '30 days') AS revenue_30d,
      (SELECT coalesce(sum(amount_cents),0)::int FROM payment_ledger WHERE status='succeeded' AND currency='USD') AS revenue_total,
      (SELECT count(*)::int FROM background_jobs WHERE status='failed') AS failed_jobs,
      (SELECT count(*)::int FROM site_claims WHERE status='pending') AS pending_claims`),
    db.execute(sql`SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS value
      FROM users WHERE created_at > now() - interval '30 days' GROUP BY 1`),
    db.execute(sql`SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS value
      FROM sites WHERE created_at > now() - interval '30 days' GROUP BY 1`),
    db.execute(sql`SELECT to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, sum(amount_cents)::int AS value
      FROM payment_ledger WHERE status='succeeded' AND currency='USD' AND occurred_at > now() - interval '30 days' GROUP BY 1`),
    db.execute(sql`SELECT lifecycle, count(*)::int AS value FROM sites GROUP BY lifecycle ORDER BY value DESC, lifecycle`),
    db.execute(sql`SELECT id, name, created_at FROM users ORDER BY created_at DESC, id LIMIT 6`),
    db.execute(sql`SELECT id, slug, name, lifecycle, is_listed, current_score, created_at FROM sites ORDER BY created_at DESC, id LIMIT 6`),
    db.execute(sql`SELECT a.id, a.action, a.target_type, a.reason, a.created_at, u.name AS actor_name
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC, a.id LIMIT 6`),
    readRedisHealth().catch(() => ({ ready: false as const, reason: "unavailable" as const })),
  ]);
  const count = (key: string) => Number(totals?.[key] ?? 0);
  return {
    totals: { users: count("users"), usersWeek: count("users_week"), proUsers: count("pro_users"), sites: count("sites"),
      sitesListed: count("sites_listed"), sitesWeek: count("sites_week"), adsActive: count("ads_active"), adPositions: count("ad_positions"),
      adsToReview: count("ads_to_review"), revenue30d: count("revenue_30d"), revenueTotal: count("revenue_total"),
      failedJobs: count("failed_jobs"), pendingClaims: count("pending_claims") },
    scores: { fast: count("score_fast"), average: count("score_average"), slow: count("score_slow") },
    signups: daily(signups, 30), submissions: daily(submissions, 30), revenue: daily(revenue, 30),
    lifecycle: [...lifecycle].map((row) => ({ label: String(row.lifecycle), value: Number(row.value) })),
    recentUsers: [...recentUsers].map((row) => ({ id: String(row.id), name: String(row.name), createdAt: iso(row.created_at) })),
    recentSites: [...recentSites].map((row) => ({ id: String(row.id), slug: String(row.slug), name: String(row.name), lifecycle: String(row.lifecycle),
      isListed: row.is_listed === true, score: Number(row.current_score), createdAt: iso(row.created_at) })),
    audit: [...audit].map((row) => ({ id: String(row.id), action: String(row.action), targetType: String(row.target_type), reason: String(row.reason),
      actorName: typeof row.actor_name === "string" ? row.actor_name : null, createdAt: iso(row.created_at) })),
    health: { database: true, redis: redis.ready ? "ready" : redis.reason },
  };
}

export const userFilters = ["all", "pro", "staff", "new"] as const;
export type UserFilter = typeof userFilters[number];
export type AdminUserRow = { id: string; name: string; email: string; isPro: boolean; role: "admin" | "moderator" | null;
  siteCount: number; createdAt: string | null; lastActiveAt: string | null };

export async function listUsers(actor: AdminActor, input: { q?: string; filter?: string; page?: string }): Promise<Paged<AdminUserRow>> {
  const db = await fullAdminDb(actor);
  const page = pageNumber(input.page), pattern = searchPattern(input.q);
  const filter = userFilters.includes(input.filter as UserFilter) ? input.filter as UserFilter : "all";
  const pro = accountProPredicate(sql`u.id`, sql`u.is_pro`);
  const where = sql`${pattern ? sql`(u.name ILIKE ${pattern} OR u.email ILIKE ${pattern})` : sql`true`} AND ${
    filter === "pro" ? pro : filter === "staff" ? sql`r.role IS NOT NULL` : filter === "new" ? sql`u.created_at > now() - interval '7 days'` : sql`true`}`;
  const [[total], rows] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS value FROM users u LEFT JOIN admin_roles r ON r.user_id = u.id WHERE ${where}`),
    db.execute(sql`SELECT u.id, u.name, u.email, u.created_at, u.last_active_at, r.role, ${pro} AS is_pro,
        (SELECT count(*)::int FROM sites s WHERE s.owner_id = u.id) AS site_count
      FROM users u LEFT JOIN admin_roles r ON r.user_id = u.id WHERE ${where}
      ORDER BY u.created_at DESC, u.id LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`),
  ]);
  return paged([...rows].map((row) => ({ id: String(row.id), name: String(row.name), email: maskEmail(String(row.email)), isPro: row.is_pro === true,
    role: row.role === "admin" || row.role === "moderator" ? row.role : null, siteCount: Number(row.site_count),
    createdAt: iso(row.created_at), lastActiveAt: iso(row.last_active_at) })), Number(total?.value ?? 0), page);
}

export const websiteFilters = ["all", "listed", "unlisted", "pro", "advertised", "paused"] as const;
export type WebsiteFilter = typeof websiteFilters[number];
export type AdminWebsiteRow = { id: string; slug: string; name: string; host: string; category: string; tier: string; lifecycle: string;
  isListed: boolean; score: number; badgeStatus: string; monitoringPaused: boolean; advertised: boolean; ownerName: string;
  ownerId: string | null; createdAt: string | null; lastTestedAt: string | null };

const advertisedSite = sql`EXISTS (SELECT 1 FROM ad_reservations ar WHERE ar.site_id = s.id AND ar.status IN ('paid','active') AND (ar.ends_at IS NULL OR ar.ends_at > now()))`;

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 80); }
}

export async function listWebsites(actor: AdminActor, input: { q?: string; filter?: string; sort?: string; owner?: string; page?: string }): Promise<Paged<AdminWebsiteRow>> {
  const db = await fullAdminDb(actor);
  const page = pageNumber(input.page), pattern = searchPattern(input.q);
  const filter = websiteFilters.includes(input.filter as WebsiteFilter) ? input.filter as WebsiteFilter : "all";
  const owner = z.uuid().safeParse(input.owner);
  const where = sql`${pattern ? sql`(s.name ILIKE ${pattern} OR s.url ILIKE ${pattern} OR s.slug ILIKE ${pattern})` : sql`true`}
    AND ${owner.success ? sql`s.owner_id = ${owner.data}::uuid` : sql`true`} AND ${
    filter === "listed" ? sql`s.is_listed` : filter === "unlisted" ? sql`NOT s.is_listed` : filter === "pro" ? sql`s.tier = 'pro'`
      : filter === "advertised" ? advertisedSite : filter === "paused" ? sql`s.monitoring_paused` : sql`true`}`;
  // Sort keys are a closed set of literals, never request text.
  const order = input.sort === "score" ? sql`s.current_score DESC, s.created_at DESC` : input.sort === "tested" ? sql`s.last_tested_at DESC NULLS LAST` : sql`s.created_at DESC`;
  const [[total], rows] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS value FROM sites s WHERE ${where}`),
    db.execute(sql`SELECT s.id, s.slug, s.name, s.url,
        coalesce((SELECT c.slug FROM site_categories sc JOIN categories c ON c.id=sc.category_id WHERE sc.site_id=s.id AND sc.is_primary AND c.active),s.category::text) AS category,
        s.tier, s.lifecycle, s.is_listed, s.current_score, s.badge_status,
        s.monitoring_paused, s.owner_id, coalesce(u.name, s.owner_name) AS owner_name, s.created_at, s.last_tested_at, ${advertisedSite} AS advertised
      FROM sites s LEFT JOIN users u ON u.id = s.owner_id WHERE ${where}
      ORDER BY ${order}, s.id LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`),
  ]);
  return paged([...rows].map((row) => ({ id: String(row.id), slug: String(row.slug), name: String(row.name), host: hostOf(String(row.url)),
    category: String(row.category), tier: String(row.tier), lifecycle: String(row.lifecycle), isListed: row.is_listed === true,
    score: Number(row.current_score), badgeStatus: String(row.badge_status), monitoringPaused: row.monitoring_paused === true,
    advertised: row.advertised === true, ownerName: String(row.owner_name), ownerId: typeof row.owner_id === "string" ? row.owner_id : null,
    createdAt: iso(row.created_at), lastTestedAt: iso(row.last_tested_at) })), Number(total?.value ?? 0), page);
}

export type AdvertisedRow = { id: number; name: string; tagline: string; host: string; position: "left" | "right"; orderIndex: number;
  status: string; live: boolean; expiresAt: string | null; ownerName: string | null; siteSlug: string | null; siteName: string | null;
  reservationStatus: string | null; startsAt: string | null; endsAt: string | null; clicks30d: number; clicksTotal: number };

export async function getAdvertising(actor: AdminActor) {
  const db = await fullAdminDb(actor);
  const [rows, [summary], clicks] = await Promise.all([
    db.execute(sql`SELECT a.id, a.name, a.tagline, a.url, a.position, a.order_index, a.status, a.expires_at,
        (a.is_active AND a.status='active' AND (a.expires_at IS NULL OR a.expires_at > now())) AS live,
        u.name AS owner_name, s.slug AS site_slug, s.name AS site_name, r.status AS reservation_status, r.starts_at, r.ends_at,
        (SELECT count(*)::int FROM ad_clicks c WHERE c.ad_slot_id = a.id AND c.clicked_at > now() - interval '30 days') AS clicks_30d,
        (SELECT count(*)::int FROM ad_clicks c WHERE c.ad_slot_id = a.id) AS clicks_total
      FROM ad_slots a
      LEFT JOIN LATERAL (SELECT status, starts_at, ends_at, site_id FROM ad_reservations WHERE ad_slot_id = a.id ORDER BY created_at DESC LIMIT 1) r ON true
      LEFT JOIN sites s ON s.id = r.site_id LEFT JOIN users u ON u.id = a.user_id
      ORDER BY live DESC, a.position, a.order_index, a.id LIMIT 100`),
    db.execute(sql`SELECT
      (SELECT count(*)::int FROM ad_inventory WHERE active) AS positions_open,
      (SELECT count(*)::int FROM ad_inventory) AS positions,
      (SELECT count(*)::int FROM ad_reservations WHERE status='paid') AS to_review,
      (SELECT count(*)::int FROM ad_reservations WHERE status='held') AS held,
      (SELECT count(*)::int FROM subscriptions sub JOIN products p ON p.id = sub.product_id WHERE p.kind='sidebar_ad' AND sub.status='active') AS subscriptions,
      (SELECT coalesce(sum(l.amount_cents),0)::int FROM payment_ledger l JOIN products p ON p.id = l.product_id
        WHERE p.kind='sidebar_ad' AND l.status='succeeded' AND l.currency='USD' AND l.occurred_at > now() - interval '30 days') AS revenue_30d`),
    db.execute(sql`SELECT to_char(date_trunc('day', clicked_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS value
      FROM ad_clicks WHERE clicked_at > now() - interval '30 days' GROUP BY 1`),
  ]);
  const ads: AdvertisedRow[] = [...rows].map((row) => ({ id: Number(row.id), name: String(row.name), tagline: String(row.tagline), host: hostOf(String(row.url)),
    position: row.position === "right" ? "right" : "left", orderIndex: Number(row.order_index), status: String(row.status), live: row.live === true,
    expiresAt: iso(row.expires_at), ownerName: typeof row.owner_name === "string" ? row.owner_name : null,
    siteSlug: typeof row.site_slug === "string" ? row.site_slug : null, siteName: typeof row.site_name === "string" ? row.site_name : null,
    reservationStatus: typeof row.reservation_status === "string" ? row.reservation_status : null, startsAt: iso(row.starts_at), endsAt: iso(row.ends_at),
    clicks30d: Number(row.clicks_30d), clicksTotal: Number(row.clicks_total) }));
  const count = (key: string) => Number(summary?.[key] ?? 0);
  return { ads, clicks: daily(clicks, 30), summary: { live: ads.filter((ad) => ad.live).length, positions: count("positions"), positionsOpen: count("positions_open"),
    toReview: count("to_review"), held: count("held"), subscriptions: count("subscriptions"), revenue30d: count("revenue_30d") } };
}

export type AdminPaymentRow = { id: string; userName: string | null; product: string | null; siteSlug: string | null; amountCents: number;
  currency: string; status: string; recurring: boolean; occurredAt: string | null };

export async function listPayments(actor: AdminActor, input: { page?: string }): Promise<Paged<AdminPaymentRow>> {
  const db = await fullAdminDb(actor);
  const page = pageNumber(input.page);
  const [[total], rows] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS value FROM payment_ledger`),
    db.execute(sql`SELECT l.id, l.amount_cents, l.currency, l.status, l.occurred_at, (l.provider_subscription_id IS NOT NULL) AS recurring,
        u.name AS user_name, p.title AS product, s.slug AS site_slug
      FROM payment_ledger l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN products p ON p.id = l.product_id LEFT JOIN sites s ON s.id = l.site_id
      ORDER BY l.occurred_at DESC, l.id LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`),
  ]);
  return paged([...rows].map((row) => ({ id: String(row.id), userName: typeof row.user_name === "string" ? row.user_name : null,
    product: typeof row.product === "string" ? row.product : null, siteSlug: typeof row.site_slug === "string" ? row.site_slug : null,
    amountCents: Number(row.amount_cents), currency: String(row.currency), status: String(row.status), recurring: row.recurring === true,
    occurredAt: iso(row.occurred_at) })), Number(total?.value ?? 0), page);
}

export type AdminAuditRow = { id: string; action: string; targetType: string; targetId: string; reason: string; actorName: string | null; createdAt: string | null };

export async function listAudit(actor: AdminActor, input: { page?: string }): Promise<Paged<AdminAuditRow>> {
  const db = await fullAdminDb(actor);
  const page = pageNumber(input.page);
  const [[total], rows] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS value FROM audit_logs`),
    db.execute(sql`SELECT a.id, a.action, a.target_type, a.target_id, a.reason, a.created_at, u.name AS actor_name
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC, a.id LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`),
  ]);
  return paged([...rows].map((row) => ({ id: String(row.id), action: String(row.action), targetType: String(row.target_type), targetId: String(row.target_id),
    reason: String(row.reason), actorName: typeof row.actor_name === "string" ? row.actor_name : null, createdAt: iso(row.created_at) })),
    Number(total?.value ?? 0), page);
}

export async function getStaff(actor: AdminActor) {
  const db = await fullAdminDb(actor);
  const rows = await db.execute(sql`SELECT r.user_id, r.role, u.name, u.last_active_at FROM admin_roles r JOIN users u ON u.id = r.user_id ORDER BY r.role, u.name LIMIT 50`);
  return [...rows].map((row) => ({ id: String(row.user_id), role: String(row.role), name: String(row.name), lastActiveAt: iso(row.last_active_at) }));
}
