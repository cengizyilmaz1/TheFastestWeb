import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  real,
  jsonb,
  serial,
  pgEnum,
  index,
  foreignKey,
  pgView,
  check,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { PSIResult } from "@/lib/pagespeed";

/** Only the validated server result is persisted; raw upstream payloads are excluded. */
export type VerifiedPerformanceResult = Omit<PSIResult, "rawResponse">;

export const categoryEnum = pgEnum("category", [
  "saas",
  "tool",
  "directory",
  "agency",
  "ecommerce",
  "blog",
  "portfolio",
  "other",
]);
export const tierEnum = pgEnum("tier", ["free", "pro"]);
export const strategyEnum = pgEnum("strategy", ["mobile", "desktop"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
]);
export const adPositionEnum = pgEnum("ad_position", ["left", "right"]);
export const backgroundJobStatuses = ["pending", "queued", "running", "succeeded", "failed", "cancelled"] as const;
export type BackgroundJobStatus = typeof backgroundJobStatuses[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  twitterHandle: text("twitter_handle"),
  isPro: boolean("is_pro").default(false).notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  grandfatherWarningSentAt: timestamp("grandfather_warning_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  url: text("url").unique().notNull(),
  // Migration preserves original URLs and backfills this key after collision checks.
  normalizedUrl: text("normalized_url").notNull(),
  description: text("description").notNull(),
  faviconUrl: text("favicon_url"),
  ownerId: uuid("owner_id").references(() => users.id),
  ownerName: text("owner_name").notNull(),
  twitterHandle: text("twitter_handle"),
  category: categoryEnum("category").default("other").notNull(),
  tier: tierEnum("tier").default("free").notNull(),
  isListed: boolean("is_listed").default(false).notNull(),
  currentScore: integer("current_score").default(0).notNull(),
  currentLoadTime: text("current_load_time"),
  currentFcp: text("current_fcp"),
  currentLcp: text("current_lcp"),
  currentCls: text("current_cls"),
  currentTbt: text("current_tbt"),
  currentTti: text("current_tti"),
  currentSi: text("current_si"),
  trend: real("trend").default(0),
  countryFlag: text("country_flag"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  monitoringPaused: boolean("monitoring_paused").default(false).notNull(),
  requiresBadge: boolean("requires_badge").default(false).notNull(),
  badgeWarningSentAt: timestamp("badge_warning_sent_at", { withTimezone: true }),
}, (table) => [
  index("sites_owner_id_idx").on(table.ownerId),
  // Existing duplicate canonical URLs survive migration. New writes lock + check in the submission transaction.
  index("sites_normalized_url_idx").on(table.normalizedUrl),
  index("sites_leaderboard_idx").on(table.isListed, table.currentScore.desc(), table.createdAt),
]);

/** Authoritative job state and transactional outbox; Redis is a recoverable transport. */
export const backgroundJobs = pgTable("background_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  queue: text("queue").notNull(),
  kind: text("kind").notNull(),
  jobKey: text("job_key").unique().notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<BackgroundJobStatus>().default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  leaseToken: uuid("lease_token"),
  leasedUntil: timestamp("leased_until", { withTimezone: true }),
  result: jsonb("result").$type<Record<string, unknown>>(),
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  correlationId: uuid("correlation_id").defaultRandom().notNull(),
}, (table) => [
  index("background_jobs_status_available_idx").on(table.status, table.availableAt),
  index("background_jobs_leased_until_idx").on(table.leasedUntil),
  index("background_jobs_site_id_idx").on(table.siteId),
  check("background_jobs_status_valid", sql`${table.status} IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled')`),
  check("background_jobs_attempts_valid", sql`${table.attempts} >= 0 AND ${table.maxAttempts} >= 1`),
  check("background_jobs_lease_pair", sql`(${table.leaseToken} IS NULL) = (${table.leasedUntil} IS NULL)`),
  check("background_jobs_payload_object", sql`jsonb_typeof(${table.payload}) = 'object'`),
  check("background_jobs_result_object", sql`${table.result} IS NULL OR jsonb_typeof(${table.result}) = 'object'`),
]);

export const jobEvents = pgTable("job_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => backgroundJobs.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  // Service/operator category only. Do not put names, email addresses or IPs here.
  actor: text("actor").notNull(),
  attempt: integer("attempt").default(0).notNull(),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("job_events_job_created_idx").on(table.jobId, table.createdAt),
  check("job_events_attempt_valid", sql`${table.attempt} >= 0`),
]);

/** Durable daily provider budget; Redis restarts must not reset consumed requests. */
export const providerUsage = pgTable("provider_usage", {
  day: date("day", { mode: "string" }).notNull(),
  provider: text("provider").notNull(),
  used: integer("used").default(0).notNull(),
}, (table) => [
  primaryKey({ name: "provider_usage_day_provider_pk", columns: [table.day, table.provider] }),
  check("provider_usage_used_valid", sql`${table.used} >= 0`),
]);

export const speedTests = pgTable("speed_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .references(() => sites.id)
    .notNull(),
  score: integer("score").notNull(),
  loadTimeMs: integer("load_time_ms"),
  fcpMs: integer("fcp_ms"),
  lcpMs: integer("lcp_ms"),
  cls: real("cls"),
  tbtMs: integer("tbt_ms"),
  ttiMs: integer("tti_ms"),
  siMs: integer("si_ms"),
  rawResponse: jsonb("raw_response"),
  strategy: strategyEnum("strategy").default("mobile").notNull(),
  methodologyVersion: text("methodology_version").default("legacy-unspecified").notNull(),
  // Retain the ledger reference: deleting a job must never permit duplicate measurements.
  backgroundJobId: uuid("background_job_id").unique().references(() => backgroundJobs.id),
  testedAt: timestamp("tested_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  index("speed_tests_site_tested_idx").on(table.siteId, table.testedAt.desc()),
]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sites.id), // nullable — payment record survives site deletion
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  polarCheckoutId: text("polar_checkout_id"),
  amountCents: integer("amount_cents").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  index("payments_user_id_idx").on(table.userId),
  index("payments_site_id_idx").on(table.siteId),
]);

export const adSlots = pgTable("ad_slots", {
  id: serial("id").primaryKey(),
  position: adPositionEnum("position").notNull(),
  orderIndex: integer("order_index").notNull(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  url: text("url").notNull(),
  faviconUrl: text("favicon_url"),
  userId: uuid("user_id"),
  polarSubscriptionId: text("polar_subscription_id"),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  foreignKey({ name: "ad_slots_user_id_fkey", columns: [table.userId], foreignColumns: [users.id] }),
  index("ad_slots_user_id_idx").on(table.userId),
]);

export const adClicks = pgTable("ad_clicks", {
  id: uuid("id").primaryKey().defaultRandom(),
  adSlotId: integer("ad_slot_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  clickedAt: timestamp("clicked_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  foreignKey({ name: "ad_clicks_ad_slot_id_fkey", columns: [table.adSlotId], foreignColumns: [adSlots.id] }),
  index("ad_clicks_slot_clicked_idx").on(table.adSlotId, table.clickedAt.desc()),
]);

// This legacy reporting view already exists in the restored snapshot.
export const adClicksWithNames = pgView("ad_clicks_with_names", {
  id: uuid("id"),
  adSlotId: integer("ad_slot_id"),
  adName: text("ad_name"),
  adUrl: text("ad_url"),
  adPosition: adPositionEnum("ad_position"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
}).existing();

export type AdClick = typeof adClicks.$inferSelect;

export const speedChecks = pgTable("speed_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  score: integer("score"),
  loadTimeMs: integer("load_time_ms"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  strategy: strategyEnum("strategy").default("mobile").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const cronLogs = pgTable("cron_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  totalSites: integer("total_sites").notNull(),
  testedCount: integer("tested_count").notNull(),
  failedCount: integer("failed_count").notNull(),
  durationMs: integer("duration_ms"),
  results: jsonb("results"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const verifiedSpeedTests = pgTable("verified_speed_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  normalizedUrl: text("normalized_url").notNull(),
  strategy: strategyEnum("strategy").notNull(),
  jobId: uuid("job_id").unique().notNull(),
  result: jsonb("result").$type<VerifiedPerformanceResult>().notNull(),
  methodologyVersion: text("methodology_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
}, (table) => [
  index("verified_speed_tests_user_created_idx").on(table.userId, table.createdAt.desc()),
  index("verified_speed_tests_expires_idx").on(table.expiresAt),
  index("verified_speed_tests_site_id_idx").on(table.siteId),
  check("verified_speed_tests_result_object", sql`jsonb_typeof(${table.result}) = 'object'`),
  check("verified_speed_tests_expiry_order", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const requestRateLimits = pgTable("request_rate_limits", {
  // SHA-256 of scope + actor; never a raw IP or email address.
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
}, (table) => [
  index("request_rate_limits_window_idx").on(table.windowStartedAt),
  check("request_rate_limits_positive_count", sql`${table.count} > 0`),
]);

// Types
export type User = typeof users.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type SpeedTest = typeof speedTests.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AdSlot = typeof adSlots.$inferSelect;
export type SpeedCheck = typeof speedChecks.$inferSelect;
export type CronLog = typeof cronLogs.$inferSelect;
export type VerifiedSpeedTest = typeof verifiedSpeedTests.$inferSelect;
export type BackgroundJob = typeof backgroundJobs.$inferSelect;
export type JobEvent = typeof jobEvents.$inferSelect;
export type ProviderUsage = typeof providerUsage.$inferSelect;
