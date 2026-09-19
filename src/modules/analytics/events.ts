import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { AppError } from "@/lib/http/errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const empty = z.object({}).strict();
const strategy = z.enum(["mobile", "desktop"]);
const measurement = z.object({ strategy, methodologyVersion: z.string().regex(/^[a-z0-9-]{1,80}$/).optional() }).strict();
const purchase = z.object({ kind: z.enum(["pro_listing", "featured_listing", "sidebar_ad", "sponsorship"]),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(), billingInterval: z.enum(["one_time", "month", "year"]).optional() }).strict();
const base = z.object({ eventKey: z.string().regex(/^[a-zA-Z0-9:_-]{1,200}$/), siteId: z.uuid().nullable().optional() });
const event = <N extends string, S extends z.ZodType>(name: N, properties: S) => base.extend({ name: z.literal(name), properties }).strict();

/** Server-owned business facts only. No arbitrary properties or browser insert API. */
export const analyticsEventSchema = z.discriminatedUnion("name", [
  event("site_submitted", z.object({ visibility: z.enum(["public", "private"]) }).strict()),
  event("site_claimed", z.object({ method: z.enum(["dns", "meta", "html", "file", "admin"]) }).strict()),
  event("speed_test_started", measurement),
  event("speed_test_completed", measurement.extend({ score: z.number().int().min(0).max(100), durationMs: z.number().int().min(0).max(600_000).optional() })),
  event("speed_test_failed", measurement.extend({ errorCode: z.string().regex(/^[A-Z0-9_]{1,80}$/) })),
  event("badge_verified", empty),
  event("badge_awarded", z.object({ achievementId: z.uuid(), periodId: z.uuid().optional() }).strict()),
  event("weekly_entered", z.object({ periodId: z.uuid(), strategy }).strict()),
  event("weekly_won", z.object({ periodId: z.uuid(), strategy, rank: z.number().int().min(1).max(3) }).strict()),
  event("share_card_generated", z.object({ awardId: z.uuid() }).strict()),
  // This is an unverified interaction count, never proof of a human or a billable click.
  event("ad_clicked", z.object({ placement: z.enum(["left", "right"]) }).strict()),
  event("checkout_started", purchase),
  event("payment_completed", purchase),
  event("subscription_changed", z.object({ status: z.enum(["pending", "active", "on_hold", "paused", "cancelled", "failed", "expired", "past_due"]) }).strict()),
  event("ad_approved", z.object({ placement: z.enum(["left", "right"]) }).strict()),
  event("ranking_finalized", z.object({ periodKind: z.enum(["weekly", "monthly"]), count: z.number().int().min(0).max(10_000_000) }).strict()),
]);
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

export async function recordAnalyticsEvent(input: AnalyticsEvent, transaction?: Transaction) {
  const parsed = analyticsEventSchema.parse(input), db = transaction ?? getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Application events are temporarily unavailable.", 503);
  const [row] = await db.insert(analyticsEvents).values(parsed).onConflictDoNothing({ target: analyticsEvents.eventKey }).returning({ id: analyticsEvents.id });
  return { recorded: Boolean(row), id: row?.id ?? null };
}

/** The admin endpoint authorizes its role before calling this bounded aggregate. */
export async function getAnalyticsSummary() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Application events are temporarily unavailable.", 503);
  const rows = await db.execute<{ name: string; day: string; count: number; trust: string }>(sql`
    SELECT name,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day,count(*)::int AS count,
      CASE WHEN name='ad_clicked' THEN 'unverified_interaction' ELSE 'server_business_event' END AS trust
    FROM analytics_events WHERE occurred_at>=now()-interval '30 days'
    GROUP BY name,day ORDER BY day DESC,name LIMIT 480`);
  return rows.map((row) => ({ ...row }));
}
