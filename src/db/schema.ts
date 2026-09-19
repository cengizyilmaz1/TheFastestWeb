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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { PSIResult } from "@/lib/pagespeed";

/** Only the validated server result is persisted; raw upstream payloads are excluded. */
export type VerifiedPerformanceResult = Omit<PSIResult, "rawResponse"> & {
  sampleCount?: number;
  metricsSource?: "lab";
  methodologyVersion?: string;
};

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
  tagline: text("tagline"),
  countryCode: text("country_code").references(() => countries.code),
  lifecycle: text("lifecycle").$type<SiteLifecycle>().default("submitted").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  redirectUrl: text("redirect_url"),
  badgeStatus: text("badge_status").$type<"verified" | "temporarily_unreachable" | "missing" | "grace_period" | "failed">().default("missing").notNull(),
  badgeCheckedAt: timestamp("badge_checked_at", { withTimezone: true }),
  badgeGraceUntil: timestamp("badge_grace_until", { withTimezone: true }),
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
  index("sites_lifecycle_country_idx").on(table.lifecycle, table.countryCode, table.currentScore.desc(), table.id),
  check("sites_lifecycle_valid", sql`${table.lifecycle} IN ('submitted','pending','verified','active','redirected','unreachable','parked','suspended','removed','archived')`),
  check("sites_badge_status_valid", sql`${table.badgeStatus} IN ('verified','temporarily_unreachable','missing','grace_period','failed')`),
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
  sampleCount: integer("sample_count").default(1).notNull(),
  metricsSource: text("metrics_source").$type<"lab">().default("lab").notNull(),
  // Retain the ledger reference: deleting a job must never permit duplicate measurements.
  backgroundJobId: uuid("background_job_id").unique().references(() => backgroundJobs.id),
  testedAt: timestamp("tested_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  index("speed_tests_site_tested_idx").on(table.siteId, table.testedAt.desc()),
  index("speed_tests_ranking_idx").on(table.methodologyVersion, table.strategy, table.testedAt, table.siteId),
  check("speed_tests_samples_valid", sql`${table.sampleCount} > 0`),
  check("speed_tests_source_valid", sql`${table.metricsSource} = 'lab'`),
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
  status: text("status").$type<"pending" | "active" | "expired" | "cancelled" | "rejected">().default("active").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  foreignKey({ name: "ad_slots_user_id_fkey", columns: [table.userId], foreignColumns: [users.id] }),
  index("ad_slots_user_id_idx").on(table.userId),
  check("ad_slots_status_valid", sql`${table.status} IN ('pending','active','expired','cancelled','rejected')`),
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

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").unique().notNull(),
  providerProductId: text("provider_product_id").unique(),
  title: text("title").notNull(),
  kind: text("kind").$type<"pro_listing" | "featured_listing" | "sidebar_ad" | "sponsorship">().notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  billingInterval: text("billing_interval").$type<"one_time" | "month" | "year">().notNull(),
  entitlementDays: integer("entitlement_days"),
  requiresSite: boolean("requires_site").default(true).notNull(),
  active: boolean("active").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("products_kind_valid", sql`${t.kind} IN ('pro_listing','featured_listing','sidebar_ad','sponsorship')`),
  check("products_amount_valid", sql`${t.amountCents} >= 0 AND ${t.currency} ~ '^[A-Z]{3}$'`),
  check("products_interval_valid", sql`${t.billingInterval} IN ('one_time','month','year')`),
  check("products_days_valid", sql`${t.entitlementDays} IS NULL OR ${t.entitlementDays} > 0`),
]);

export const checkoutOrders = pgTable("checkout_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  idempotencyKey: text("idempotency_key").unique().notNull(),
  providerCheckoutId: text("provider_checkout_id").unique(),
  checkoutUrl: text("checkout_url"),
  status: text("status").$type<"pending" | "creating" | "uncertain" | "ready" | "paid" | "failed" | "expired">().default("pending").notNull(),
  productSnapshot: jsonb("product_snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("checkout_orders_user_created_idx").on(t.userId, t.createdAt.desc()),
  check("checkout_orders_status_valid", sql`${t.status} IN ('pending','creating','uncertain','ready','paid','failed','expired')`),
  check("checkout_orders_snapshot_object", sql`jsonb_typeof(${t.productSnapshot}) = 'object'`),
]);

export const providerPayments = pgTable("payment_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").default("dodo").notNull(),
  providerPaymentId: text("provider_payment_id").unique().notNull(),
  orderId: uuid("order_id").references(() => checkoutOrders.id),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: text("status").$type<"pending" | "succeeded" | "failed" | "refunded" | "disputed">().notNull(),
  providerSubscriptionId: text("provider_subscription_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("payment_ledger_user_created_idx").on(t.userId, t.createdAt.desc()),
  check("payment_ledger_amount_valid", sql`${t.amountCents} >= 0 AND ${t.currency} ~ '^[A-Z]{3}$'`),
  check("payment_ledger_status_valid", sql`${t.status} IN ('pending','succeeded','failed','refunded','disputed')`),
]);

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerEventId: text("provider_event_id").unique().notNull(),
  type: text("type").notNull(),
  resourceId: text("resource_id").notNull(),
  orderId: uuid("order_id").references(() => checkoutOrders.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  payloadHash: text("payload_hash").notNull(),
  normalizedPayload: jsonb("normalized_payload").$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("payment_events_payload_object", sql`jsonb_typeof(${t.normalizedPayload}) = 'object'`)]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerSubscriptionId: text("provider_subscription_id").unique().notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("subscriptions_user_idx").on(t.userId)]);

export const entitlements = pgTable("entitlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  adSlotId: integer("ad_slot_id").references(() => adSlots.id, { onDelete: "set null" }),
  kind: text("kind").$type<"PRO" | "FEATURED" | "AD_SLOT" | "SPONSORSHIP">().notNull(),
  source: text("source").$type<"legacy" | "dodo">().notNull(),
  sourceId: text("source_id").notNull(),
  status: text("status").$type<"active" | "revoked">().default("active").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("entitlements_source_kind_unique").on(t.source, t.sourceId, t.kind),
  index("entitlements_user_kind_idx").on(t.userId, t.kind, t.status),
  index("entitlements_site_idx").on(t.siteId),
  check("entitlements_kind_valid", sql`${t.kind} IN ('PRO','FEATURED','AD_SLOT','SPONSORSHIP')`),
  check("entitlements_source_valid", sql`${t.source} IN ('legacy','dodo')`),
  check("entitlements_status_valid", sql`${t.status} IN ('active','revoked')`),
]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  marketing: boolean("marketing").default(false).notNull(),
  performance: boolean("performance").default(true).notNull(),
  weekly: boolean("weekly").default(true).notNull(),
  badge: boolean("badge").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  eventKey: text("event_key").unique().notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("notifications_user_created_idx").on(t.userId, t.createdAt.desc()),
  check("notifications_payload_object", sql`jsonb_typeof(${t.payload}) = 'object'`),
]);

export const emailDeliveries = pgTable("email_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "set null" }),
  eventKey: text("event_key").unique().notNull(),
  template: text("template").notNull(),
  recipient: text("recipient").notNull(),
  status: text("status").$type<"pending" | "sending" | "accepted" | "suppressed" | "failed" | "uncertain">().default("pending").notNull(),
  providerMessageId: text("provider_message_id"),
  attempts: integer("attempts").default(0).notNull(),
  lastErrorCode: text("last_error_code"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("email_deliveries_status_created_idx").on(t.status, t.createdAt),
  check("email_deliveries_status_valid", sql`${t.status} IN ('pending','sending','accepted','suppressed','failed','uncertain')`),
  check("email_deliveries_attempts_valid", sql`${t.attempts} >= 0`),
]);

export const siteLifecycles = ["submitted", "pending", "verified", "active", "redirected", "unreachable", "parked", "suspended", "removed", "archived"] as const;
export type SiteLifecycle = typeof siteLifecycles[number];

export const countries = pgTable("countries", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
}, (t) => [check("countries_code_valid", sql`${t.code} ~ '^[A-Z]{2}$'`)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
}, (t) => [check("categories_slug_valid", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)]);

export const siteCategories = pgTable("site_categories", {
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  isPrimary: boolean("is_primary").default(false).notNull(),
}, (t) => [
  primaryKey({ name: "site_categories_pk", columns: [t.siteId, t.categoryId] }),
  uniqueIndex("site_categories_primary_unique").on(t.siteId).where(sql`${t.isPrimary}`),
  index("site_categories_category_idx").on(t.categoryId, t.siteId),
]);

export const technologies = pgTable("technologies", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  websiteUrl: text("website_url"),
  active: boolean("active").default(true).notNull(),
}, (t) => [check("technologies_slug_valid", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)]);

export const siteTechnologies = pgTable("site_technologies", {
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  technologyId: uuid("technology_id").notNull().references(() => technologies.id),
  source: text("source").$type<"manual" | "detected">().default("manual").notNull(),
  confidence: real("confidence"),
}, (t) => [
  primaryKey({ name: "site_technologies_pk", columns: [t.siteId, t.technologyId] }),
  index("site_technologies_technology_idx").on(t.technologyId, t.siteId),
  check("site_technologies_source_valid", sql`${t.source} IN ('manual','detected')`),
  check("site_technologies_confidence_valid", sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`),
]);

export const founders = pgTable("founders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").unique().references(() => users.id, { onDelete: "set null" }),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  countryCode: text("country_code").references(() => countries.code),
  websiteUrl: text("website_url"),
  visibility: text("visibility").$type<"public" | "private">().default("private").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("founders_slug_valid", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("founders_visibility_valid", sql`${t.visibility} IN ('public','private')`),
  index("founders_public_country_idx").on(t.visibility, t.countryCode, t.slug),
]);

export const founderSites = pgTable("founder_sites", {
  founderId: uuid("founder_id").notNull().references(() => founders.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ name: "founder_sites_pk", columns: [t.founderId, t.siteId] }),
  index("founder_sites_site_idx").on(t.siteId),
]);

export const founderSiteInvitations = pgTable("founder_site_invitations", {
  id:uuid("id").primaryKey().defaultRandom(),
  siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"cascade"}),
  founderId:uuid("founder_id").notNull().references(()=>founders.id,{onDelete:"cascade"}),
  inviterUserId:uuid("inviter_user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  invitedUserId:uuid("invited_user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  status:text("status").$type<"pending"|"accepted"|"declined"|"revoked"|"expired">().default("pending").notNull(),
  expiresAt:timestamp("expires_at",{withTimezone:true}).default(sql`now()+interval '7 days'`).notNull(),
  respondedAt:timestamp("responded_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
},(t)=>[
  uniqueIndex("founder_site_invitations_pending_unique").on(t.siteId,t.founderId).where(sql`${t.status}='pending'`),
  index("founder_site_invitations_recipient_idx").on(t.invitedUserId,t.status,t.createdAt.desc()),
  index("founder_site_invitations_site_idx").on(t.siteId,t.status),
  check("founder_site_invitations_status_valid",sql`${t.status} IN ('pending','accepted','declined','revoked','expired')`),
  check("founder_site_invitations_expiry_valid",sql`${t.expiresAt}>${t.createdAt}`),
]);

export const founderSocialLinks = pgTable("founder_social_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  founderId: uuid("founder_id").notNull().references(() => founders.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
}, (t) => [uniqueIndex("founder_social_links_platform_unique").on(t.founderId, t.platform)]);

export const siteSocialLinks = pgTable("site_social_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
}, (t) => [uniqueIndex("site_social_links_platform_unique").on(t.siteId, t.platform)]);

export const siteClaims = pgTable("site_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  method: text("method").$type<"dns_txt" | "well_known" | "meta_tag">().notNull(),
  tokenHash: text("token_hash").unique().notNull(),
  status: text("status").$type<"pending" | "verified" | "rejected" | "expired" | "cancelled">().default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("site_claims_user_created_idx").on(t.userId, t.createdAt.desc()),
  index("site_claims_site_status_idx").on(t.siteId, t.status),
  check("site_claims_method_valid", sql`${t.method} IN ('dns_txt','well_known','meta_tag')`),
  check("site_claims_status_valid", sql`${t.status} IN ('pending','verified','rejected','expired','cancelled')`),
  check("site_claims_token_valid", sql`${t.tokenHash} ~ '^[a-f0-9]{64}$'`),
  check("site_claims_attempts_valid", sql`${t.attempts} >= 0 AND ${t.expiresAt} > ${t.createdAt}`),
]);

export const competitionPeriods = pgTable("competition_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"weekly" | "monthly">().notNull(),
  periodKey: text("period_key").unique().notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"open" | "closed">().default("open").notNull(),
  rankingAlgorithmVersion: text("ranking_algorithm_version").notNull(),
  performanceMethodVersion: text("performance_method_version").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => [
  index("competition_periods_kind_start_idx").on(t.kind, t.startAt.desc()),
  check("competition_periods_kind_valid", sql`${t.kind} IN ('weekly','monthly')`),
  check("competition_periods_status_valid", sql`${t.status} IN ('open','closed')`),
  check("competition_periods_dates_valid", sql`${t.endAt} > ${t.startAt} AND ((${t.status} = 'closed') = (${t.closedAt} IS NOT NULL))`),
]);

export const rankingSnapshots = pgTable("ranking_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  periodId: uuid("period_id").notNull().references(() => competitionPeriods.id),
  scope: text("scope").$type<"overall" | "country" | "category" | "technology" | "improved" | "newcomer">().notNull(),
  scopeKey: text("scope_key").default("").notNull(),
  strategy: strategyEnum("strategy").default("mobile").notNull(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  rank: integer("rank").notNull(),
  score: real("score").notNull(),
  lcpMs: integer("lcp_ms"),
  cls: real("cls"),
  tbtMs: integer("tbt_ms"),
  sampleCount: integer("sample_count").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
  siteSnapshot: jsonb("site_snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("ranking_snapshots_site_unique").on(t.periodId, t.scope, t.scopeKey, t.strategy, t.siteId),
  uniqueIndex("ranking_snapshots_rank_unique").on(t.periodId, t.scope, t.scopeKey, t.strategy, t.rank),
  index("ranking_snapshots_site_idx").on(t.siteId, t.createdAt.desc()),
  check("ranking_snapshots_scope_valid", sql`${t.scope} IN ('overall','country','category','technology','improved','newcomer')`),
  check("ranking_snapshots_metrics_valid", sql`${t.rank} > 0 AND ${t.score} >= 0 AND ${t.score} <= 100 AND ${t.sampleCount} > 0`),
  check("ranking_snapshots_evidence_object", sql`jsonb_typeof(${t.evidence}) = 'object' AND jsonb_typeof(${t.siteSnapshot}) = 'object'`),
]);

export const achievements = pgTable("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").unique().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  active: boolean("active").default(true).notNull(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id:uuid("id").primaryKey().defaultRandom(),
  eventKey:text("event_key").unique().notNull(),
  name:text("name").notNull(),
  siteId:uuid("site_id").references(()=>sites.id,{onDelete:"set null"}),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).defaultNow().notNull(),
  properties:jsonb("properties").$type<Record<string,unknown>>().default({}).notNull(),
},(t)=>[
  index("analytics_events_name_occurred_idx").on(t.name,t.occurredAt.desc()),
  check("analytics_events_name_valid",sql`${t.name} IN ('site_submitted','site_claimed','speed_test_started','speed_test_completed','speed_test_failed','badge_verified','badge_awarded','weekly_entered','weekly_won','share_card_generated','ad_clicked','checkout_started','payment_completed','subscription_changed','ad_approved','ranking_finalized')`),
  check("analytics_events_properties_object",sql`jsonb_typeof(${t.properties})='object'`),
]);

export const adInventory = pgTable("ad_inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  position: adPositionEnum("position").notNull(),
  orderIndex: integer("order_index").notNull(),
  active: boolean("active").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("ad_inventory_position_order_unique").on(t.position,t.orderIndex),
  check("ad_inventory_order_nonnegative",sql`${t.orderIndex} >= 0`),
]);

export const adReservations = pgTable("ad_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  inventoryId: uuid("inventory_id").notNull().references(()=>adInventory.id,{onDelete:"restrict"}),
  orderId: uuid("order_id").notNull().unique().references(()=>checkoutOrders.id,{onDelete:"restrict"}),
  userId: uuid("user_id").notNull().references(()=>users.id,{onDelete:"restrict"}),
  siteId: uuid("site_id").references(()=>sites.id,{onDelete:"set null"}),
  adSlotId: integer("ad_slot_id").references(()=>adSlots.id,{onDelete:"set null"}),
  status: text("status").$type<"held"|"paid"|"active"|"expired"|"cancelled"|"refunded"|"rejected">().default("held").notNull(),
  startsAt: timestamp("starts_at",{withTimezone:true}),
  endsAt: timestamp("ends_at",{withTimezone:true}),
  releaseEvidence: text("release_evidence"),
  createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
}, (t)=>[
  uniqueIndex("ad_reservations_live_inventory_unique").on(t.inventoryId).where(sql`${t.status} IN ('held','paid','active')`),
  index("ad_reservations_user_created_idx").on(t.userId,t.createdAt),
  check("ad_reservations_status_valid",sql`${t.status} IN ('held','paid','active','expired','cancelled','refunded','rejected')`),
  check("ad_reservations_window_valid",sql`(${t.startsAt} IS NULL AND ${t.endsAt} IS NULL) OR (${t.startsAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL AND ${t.endsAt} > ${t.startsAt})`),
  check("ad_reservations_active_window",sql`${t.status} <> 'active' OR (${t.startsAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL)`),
]);

export const siteAwards = pgTable("site_awards", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id),
  periodId: uuid("period_id").references(() => competitionPeriods.id),
  eventKey: text("event_key").unique().notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
  awardedAt: timestamp("awarded_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("site_awards_site_idx").on(t.siteId, t.awardedAt.desc()),
  check("site_awards_evidence_object", sql`jsonb_typeof(${t.evidence}) = 'object'`),
]);

export const siteScreenshots = pgTable("site_screenshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  serviceJobId: uuid("service_job_id").unique().notNull(),
  backgroundJobId: uuid("background_job_id").unique().references(() => backgroundJobs.id),
  device: text("device").$type<"desktop" | "mobile">().notNull(),
  mode: text("mode").$type<"viewport" | "fullpage">().notNull(),
  objectKey: text("object_key").unique().notNull(),
  publicUrl: text("public_url").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  hash: text("hash").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  retentionUntil: timestamp("retention_until", { withTimezone: true }),
  sourceUrl: text("source_url").notNull(),
  status: text("status").$type<"ready" | "expired" | "removed">().default("ready").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("site_screenshots_site_captured_idx").on(t.siteId, t.capturedAt.desc()),
  index("site_screenshots_retention_idx").on(t.retentionUntil),
  check("site_screenshots_device_valid", sql`${t.device} IN ('desktop','mobile') AND ${t.mode} IN ('viewport','fullpage')`),
  check("site_screenshots_size_valid", sql`${t.width} > 0 AND ${t.height} > 0 AND ${t.size} > 0`),
  check("site_screenshots_status_valid", sql`${t.status} IN ('ready','expired','removed')`),
]);

export const adminRoles = pgTable("admin_roles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<"admin" | "moderator">().notNull(),
}, (t) => [check("admin_roles_role_valid", sql`${t.role} IN ('admin','moderator')`)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("audit_logs_target_created_idx").on(t.targetType, t.targetId, t.createdAt.desc()),
  check("audit_logs_payload_object", sql`jsonb_typeof(${t.payload}) = 'object'`),
]);
