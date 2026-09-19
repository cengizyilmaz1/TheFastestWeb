import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../../src/db";
import { validateRuntimeEnv } from "../../src/config/env";
import { consumePageSpeedBudget, ProviderQuotaError } from "../../src/modules/jobs/provider-budget";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const { minuteBudget } = vi.hoisted(() => ({ minuteBudget: vi.fn() }));
vi.mock("../../src/infrastructure/queue/redis", () => ({ consumeRateLimit: minuteBudget }));

beforeAll(async () => {
  vi.stubEnv("PSI_REQUESTS_PER_DAY", "3");
  vi.stubEnv("PSI_REQUESTS_PER_MINUTE", "120");
  await prepareIntegrationDatabase();
  validateRuntimeEnv();
}, 60_000);
afterAll(async () => {
  await cleanupIntegrationDatabase();
  vi.unstubAllEnvs();
  validateRuntimeEnv();
}, 30_000);
beforeEach(async () => {
  await resetIntegrationData();
  minuteBudget.mockReset().mockResolvedValue({ allowed: true, retryAfterMs: 60_000 });
});

async function reservations() {
  const [row] = await fixtureSql()`SELECT count(*)::integer AS rows, coalesce(sum(used),0)::integer AS used FROM provider_usage`;
  return { rows: row.rows as number, used: row.used as number };
}

describe("durable provider budget with a least-privilege PostgreSQL application role", () => {
  it("atomically caps concurrent reservations across database connections without incrementing denials", async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => consumePageSpeedBudget()));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    const denied = attempts.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
    expect(denied).toHaveLength(17);
    for (const { reason } of denied) {
      expect(reason).toBeInstanceOf(ProviderQuotaError);
      expect(reason).toMatchObject({ code: "RATE_LIMITED", status: 429 });
      expect(reason.retryAfterMs).toBeGreaterThanOrEqual(1000);
      expect(reason.retryAfterMs).toBeLessThanOrEqual(86_400_000);
    }
    expect(await reservations()).toEqual({ rows: 1, used: 3 });
    expect(minuteBudget).toHaveBeenCalledTimes(20);
    expect(minuteBudget).toHaveBeenCalledWith("psi-provider", "all", 120, 60_000);
  });

  it("retains charged reservations after an application reconnect and a reset Redis counter", async () => {
    await Promise.all(Array.from({ length: 3 }, () => consumePageSpeedBudget()));
    await closeDb();
    minuteBudget.mockReset().mockResolvedValue({ allowed: true, retryAfterMs: 60_000 });
    await expect(consumePageSpeedBudget()).rejects.toBeInstanceOf(ProviderQuotaError);
    expect(await reservations()).toEqual({ rows: 1, used: 3 });
  });

  it("starts a new UTC day without resetting prior-day or other-provider usage", async () => {
    await fixtureSql()`INSERT INTO provider_usage(day,provider,used) VALUES
      ((now() AT TIME ZONE 'UTC')::date - 1,'pagespeed',3),
      ((now() AT TIME ZONE 'UTC')::date,'another-provider',999)`;
    await consumePageSpeedBudget();
    const [row] = await fixtureSql()`SELECT
      max(used) FILTER (WHERE day=(now() AT TIME ZONE 'UTC')::date AND provider='pagespeed') AS today,
      max(used) FILTER (WHERE day=(now() AT TIME ZONE 'UTC')::date - 1 AND provider='pagespeed') AS yesterday,
      max(used) FILTER (WHERE provider='another-provider') AS other FROM provider_usage`;
    expect({ ...row }).toEqual({ today: 1, yesterday: 3, other: 999 });
  });

  it("uses UTC dates even when the application database session is on a different calendar day", async () => {
    const sql = fixtureSql();
    const role = new URL(process.env.DATABASE_URL!).username;
    const [clock] = await sql`SELECT extract(hour FROM now() AT TIME ZONE 'UTC')::integer AS hour`;
    await closeDb();
    if (clock.hour >= 10) await sql`ALTER ROLE ${sql(role)} SET timezone TO 'Pacific/Kiritimati'`;
    else await sql`ALTER ROLE ${sql(role)} SET timezone TO 'Etc/GMT+12'`;
    try {
      await consumePageSpeedBudget();
      const { sql: query } = await import("drizzle-orm");
      const [dates] = await getDb()!.execute<{ utc: string; local: string }>(query`SELECT
        ((now() AT TIME ZONE 'UTC')::date)::text AS utc, current_date::text AS local`);
      expect(dates.local).not.toBe(dates.utc);
      const [usage] = await fixtureSql()`SELECT day::text AS day,used FROM provider_usage`;
      expect({ ...usage }).toEqual({ day: dates.utc, used: 1 });
    } finally {
      await closeDb();
      await sql`ALTER ROLE ${sql(role)} RESET timezone`;
    }
  });

  it("does not reserve a daily request when the minute limit denies it", async () => {
    minuteBudget.mockResolvedValue({ allowed: false, retryAfterMs: 3210 });
    await expect(consumePageSpeedBudget()).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 3210 });
    expect(await reservations()).toEqual({ rows: 0, used: 0 });
  });

  it("fails closed when Redis cannot establish the shared minute budget", async () => {
    minuteBudget.mockRejectedValue(new Error("Synthetic Redis outage"));
    await expect(consumePageSpeedBudget()).rejects.toThrow("Synthetic Redis outage");
    expect(await reservations()).toEqual({ rows: 0, used: 0 });
  });

  it("fails closed when the database configuration is unavailable", async () => {
    const original = process.env.DATABASE_URL;
    await closeDb();
    delete process.env.DATABASE_URL;
    try {
      await expect(consumePageSpeedBudget()).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE", status: 503 });
    } finally {
      process.env.DATABASE_URL = original;
    }
    expect(await reservations()).toEqual({ rows: 0, used: 0 });
  });

  it("fails closed when PostgreSQL rejects a quota write", async () => {
    const sql = fixtureSql();
    const role = new URL(process.env.DATABASE_URL!).username;
    await sql`REVOKE INSERT ON public.provider_usage FROM ${sql(role)}`;
    try {
      await expect(consumePageSpeedBudget()).rejects.toBeDefined();
    } finally {
      await sql`GRANT INSERT ON public.provider_usage TO ${sql(role)}`;
    }
    expect(await reservations()).toEqual({ rows: 0, used: 0 });
  });
});
