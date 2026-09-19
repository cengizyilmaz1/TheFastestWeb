import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { closeDb } from "../../src/db";
import { migrateDatabase } from "../../scripts/db/migrate";

let control: ReturnType<typeof postgres> | undefined;
let owner: ReturnType<typeof postgres> | undefined;
let databaseName: string | undefined;
let appRole: string | undefined;
let originalUrl: string | undefined;
let databaseCreated = false;
let roleCreated = false;

export async function prepareIntegrationDatabase(): Promise<void> {
  const raw = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!raw) throw new Error("MIGRATION_TEST_DATABASE_URL must point to a disposable loopback tfw_test_ database");
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.startsWith("/tfw_test_")) {
    throw new Error("Integration tests refuse a non-loopback or non-tfw_test_ database");
  }
  originalUrl = process.env.DATABASE_URL;
  const suffix = randomBytes(6).toString("hex");
  databaseName = `tfw_test_listing_${suffix}`;
  appRole = `tfw_test_app_${suffix}`;
  control = postgres(raw, { max: 1, onnotice: () => undefined });
  await control`CREATE DATABASE ${control(databaseName)}`;
  databaseCreated = true;
  url.pathname = `/${databaseName}`;
  await migrateDatabase({ databaseUrl: url.toString(), log: () => undefined });
  owner = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  await control`CREATE ROLE ${control(appRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`;
  roleCreated = true;
  await owner`GRANT USAGE ON SCHEMA public TO ${owner(appRole)}`;
  await owner`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${owner(appRole)}`;
  await owner`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${owner(appRole)}`;
  url.username = appRole;
  url.password = "";
  await closeDb();
  process.env.DATABASE_URL = url.toString();
}

export function fixtureSql(): ReturnType<typeof postgres> {
  if (!owner) throw new Error("Integration database is not ready");
  return owner;
}

export async function resetIntegrationData(): Promise<void> {
  await fixtureSql()`TRUNCATE public.analytics_events,public.ad_reservations,public.ad_inventory,public.payment_events, public.payment_ledger, public.subscriptions,
    public.checkout_orders, public.products, public.entitlements, public.email_deliveries,
    public.notifications, public.notification_preferences, public.founder_social_links, public.founder_sites,
    public.founders, public.site_social_links, public.site_categories, public.site_technologies,
    public.site_claims, public.ranking_snapshots, public.competition_periods, public.site_awards,
    public.achievements, public.site_screenshots, public.admin_roles, public.audit_logs,
    public.job_events, public.background_jobs, public.provider_usage,
    public.verified_speed_tests, public.speed_tests, public.payments,
    public.ad_clicks, public.ad_slots, public.speed_checks, public.cron_logs,
    public.request_rate_limits, public.sites, public.users RESTART IDENTITY CASCADE`;
}

export async function cleanupIntegrationDatabase(): Promise<void> {
  await closeDb();
  await owner?.end({ timeout: 5 });
  if (control && databaseName && databaseCreated) await control`DROP DATABASE ${control(databaseName)} WITH (FORCE)`;
  if (control && appRole && roleCreated) await control`DROP ROLE ${control(appRole)}`;
  await control?.end({ timeout: 5 });
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
  control = undefined;
  owner = undefined;
  databaseName = undefined;
  appRole = undefined;
  databaseCreated = false;
  roleCreated = false;
}
