import { describe, expect, it } from "vitest";
import { EnvironmentError, parseEnv } from "./env";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:unit-test-password@database:5432/test",
  REDIS_URL: "redis://:unit-test-only-redis-password-at-least-32@redis:6379/0",
  AUTH_SECRET: "unit-test-only-auth-secret-at-least-32-characters",
  AUTH_GOOGLE_ID: "test-oauth-client",
  AUTH_GOOGLE_SECRET: "test-oauth-secret",
  AUTH_TRUST_HOST: "true",
};

describe("runtime environment", () => {
  it("allows production builds without runtime secrets", () => {
    expect(parseEnv({ NODE_ENV: "production" }).SITE_URL).toBe("https://thefastestweb.site");
  });

  it("fails closed at production startup without core credentials", () => {
    expect(() => parseEnv({ NODE_ENV: "production" }, { requireProductionSecrets: true }))
      .toThrow(EnvironmentError);
  });

  it("accepts explicit trusted proxy production configuration", () => {
    expect(parseEnv(production, { requireProductionSecrets: true }).AUTH_TRUST_HOST).toBe(true);
  });

  it("canonicalizes origins before same-origin comparison", () => {
    const config = parseEnv({
      ...production,
      SITE_URL: "https://THEFASTESTWEB.site:443/",
      AUTH_URL: "https://thefastestweb.site/",
    }, { requireProductionSecrets: true });
    expect(config.SITE_URL).toBe("https://thefastestweb.site");
    expect(config.AUTH_URL).toBe("https://thefastestweb.site");
  });

  it.each([
    { AUTH_SECRET: "short" },
    { SITE_URL: "http://thefastestweb.site" },
    { SITE_URL: "https://user:password@thefastestweb.site" },
    { SITE_URL: "https://thefastestweb.site/path" },
    { AUTH_TRUST_HOST: "false" },
    { AUTH_URL: "https://old-deployment.example.test" },
    { DATABASE_URL: "postgresql://" },
    { DB_MAX_CONNECTIONS: "-1" },
  ])("rejects invalid runtime settings: %j", (change) => {
    expect(() => parseEnv({ ...production, ...change }, { requireProductionSecrets: true })).toThrow(EnvironmentError);
  });

  it("does not enable legacy email just because credentials exist", () => {
    const config = parseEnv({ RESEND_API_KEY: "test-only" });
    expect(config.ENABLE_LEGACY_RESEND).toBe(false);
  });

  it("validates background dependencies without requiring web credentials", () => {
    for (const role of ["worker", "scheduler"] as const) {
      const config = parseEnv({ NODE_ENV: "production", DATABASE_URL: production.DATABASE_URL,
        REDIS_URL: production.REDIS_URL }, { requireProductionSecrets: true, role });
      expect(config.AUTH_SECRET).toBeUndefined();
      expect(config.SCHEDULER_ENABLED).toBe(false);
      expect(config.WORKER_CONCURRENCY).toBe(2);
      expect(config.QUEUE_PREFIX).toBe("tfw");
    }
  });

  it.each([
    { REDIS_URL: "" }, { REDIS_URL: "https://redis.example.test" },
    { REDIS_URL: "redis://redis:6379/0" },
    { REDIS_URL: "redis://:short@redis:6379/0" },
    { REDIS_URL: `${production.REDIS_URL}?password=ignored` },
    { REDIS_URL: `${production.REDIS_URL}#ignored` },
    { REDIS_URL: "redis://:invalid%GG@redis:6379/0" },
    { REDIS_URL: "redis://redis:6379/16" },
    { QUEUE_PREFIX: "tfw:other" }, { QUEUE_PREFIX: "tfw*" },
    { WORKER_CONCURRENCY: "9" }, { PSI_REQUESTS_PER_MINUTE: "0" },
    { PSI_REQUESTS_PER_DAY: "-1" }, { SCHEDULER_ENABLED: "yes" },
    { SCHEDULER_INTERVAL_SECONDS: "301" }, { JOB_MAX_ATTEMPTS: "11" },
    { WORKER_HEALTH_PORT: "65536" }, { SCHEDULER_HEALTH_PORT: "0" },
  ])("rejects unsafe queue configuration: %j", (change) => {
    expect(() => parseEnv({ ...production, ...change }, { requireProductionSecrets: true }))
      .toThrow(EnvironmentError);
  });

  it("supports authenticated TLS Redis and explicit scheduler cutover", () => {
    const config = parseEnv({ ...production, REDIS_URL: production.REDIS_URL.replace("redis:", "rediss:"),
      SCHEDULER_ENABLED: "true" }, { requireProductionSecrets: true });
    expect(config.SCHEDULER_ENABLED).toBe(true);
    expect(config.PSI_REQUESTS_PER_MINUTE).toBe(10);
    expect(config.PSI_REQUESTS_PER_DAY).toBe(1000);
    expect(config.SCHEDULER_INTERVAL_SECONDS).toBe(60);
    expect(config.JOB_MAX_ATTEMPTS).toBe(3);
  });

  it("requires credentials for explicitly enabled legacy email", () => {
    expect(() => parseEnv({ ENABLE_LEGACY_RESEND: "true" })).toThrow(EnvironmentError);
  });

  it("does not include secret values in configuration errors", () => {
    const secret = "invalid-secret-do-not-log";
    try {
      parseEnv({ AUTH_SECRET: secret });
      expect.fail("Expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentError);
      expect(String(error)).toContain("AUTH_SECRET");
      expect(String(error)).not.toContain(secret);
    }
  });
});
