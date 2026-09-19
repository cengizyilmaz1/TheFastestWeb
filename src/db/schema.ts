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
} from "drizzle-orm/pg-core";

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

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // Supabase auth user ID — no defaultRandom
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
});

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
  testedAt: timestamp("tested_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
});

export const adSlots = pgTable("ad_slots", {
  id: serial("id").primaryKey(),
  position: adPositionEnum("position").notNull(),
  orderIndex: integer("order_index").notNull(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  url: text("url").notNull(),
  faviconUrl: text("favicon_url"),
  userId: uuid("user_id").references(() => users.id),
  polarSubscriptionId: text("polar_subscription_id"),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const adClicks = pgTable("ad_clicks", {
  id: uuid("id").primaryKey().defaultRandom(),
  adSlotId: integer("ad_slot_id").references(() => adSlots.id),
  ip: text("ip"),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  clickedAt: timestamp("clicked_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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

// Types
export type User = typeof users.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type SpeedTest = typeof speedTests.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AdSlot = typeof adSlots.$inferSelect;
export type SpeedCheck = typeof speedChecks.$inferSelect;
export type CronLog = typeof cronLogs.$inferSelect;
