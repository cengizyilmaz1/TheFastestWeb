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
  it("permits a read-only demo without OAuth but retains core security requirements", () => {
    const demo = { ...production, DEPLOYMENT_MODE: "demo", AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "" };
    expect(parseEnv(demo, { requireProductionSecrets: true }).DEPLOYMENT_MODE).toBe("demo");
    for (const change of [{ AUTH_SECRET: "" }, { SITE_URL: "http://example.com" }, { AUTH_TRUST_HOST: "false" },
      { SCHEDULER_ENABLED: "true" }, { EMAIL_ENABLED: "true" }, { PAYMENTS_ENABLED: "true" }, { ANALYTICS_ENABLED: "true" }]) {
      expect(() => parseEnv({ ...demo, ...change }, { requireProductionSecrets: true })).toThrow(EnvironmentError);
    }
  });
  it("allows production builds without runtime secrets", () => {
    const config = parseEnv({ NODE_ENV: "production" });
    expect(config.SITE_URL).toBe("https://thefastestweb.site");
    expect(config.TFW_REDIRECT_CUTOVER_ENABLED).toBe(false);
  });

  it("requires a fully pinned manifest only when the cutover gate is enabled", () => {
    const digest = "a".repeat(64);
    const enabled = parseEnv({
      TFW_REDIRECT_CUTOVER_ENABLED: "true",
      TFW_REDIRECT_MANIFEST_PATH: "/app/runtime/redirect-manifests/thefastestweb-redirects-v1-aaaaaaaaaaaaaaaa.json",
      TFW_REDIRECT_MANIFEST_DIGEST: digest,
    });
    expect(enabled.TFW_REDIRECT_CUTOVER_ENABLED).toBe(true);
    expect(enabled.TFW_REDIRECT_MANIFEST_DIGEST).toBe(digest);
    for (const change of [
      { TFW_REDIRECT_MANIFEST_PATH: "" },
      { TFW_REDIRECT_MANIFEST_DIGEST: "" },
      { TFW_REDIRECT_MANIFEST_DIGEST: "A".repeat(64) },
    ]) {
      expect(() => parseEnv({
        TFW_REDIRECT_CUTOVER_ENABLED: "true",
        TFW_REDIRECT_MANIFEST_PATH: "/app/runtime/redirect-manifests/thefastestweb-redirects-v1-aaaaaaaaaaaaaaaa.json",
        TFW_REDIRECT_MANIFEST_DIGEST: digest,
        ...change,
      })).toThrow(EnvironmentError);
    }
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

  it("does not enable providers just because credentials exist", () => {
    const config = parseEnv({ DODO_API_KEY: "synthetic-test-key", M365_CLIENT_SECRET: "synthetic-test-secret" });
    expect(config.EMAIL_ENABLED).toBe(false);
    expect(config.PAYMENTS_ENABLED).toBe(false);
    expect(config.STORAGE_ENABLED).toBe(false);
    expect(config.ANALYTICS_ENABLED).toBe(false);
    expect(config.DATAFAST_BOT_TRACKING_ENABLED).toBe(false);
    expect(config.DATAFAST_BOT_TRUSTED_IP_HEADER).toBe("none");
  });

  it("requires a dedicated matching DataFast website before enabling crawler tracking", () => {
    const config = { DATAFAST_BOT_TRACKING_ENABLED: "true", DATAFAST_WEBSITE_ID: "dfid_synthetic", DATAFAST_DOMAIN: "thefastestweb.site" };
    expect(parseEnv(config).DATAFAST_BOT_TRACKING_ENABLED).toBe(true);
    for (const change of [{ DATAFAST_WEBSITE_ID: "" }, { DATAFAST_DOMAIN: "indietools.app" }, { DEPLOYMENT_MODE: "demo" },
      { DATAFAST_BOT_TOKEN: "df_wrong_kind_of_key" }, { DATAFAST_BOT_TRUSTED_IP_HEADER: "untrusted-client-ip" }]) {
      expect(() => parseEnv({ ...config, ...change })).toThrow(EnvironmentError);
    }
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

  it("lets the scheduler generate screenshots without giving it capture credentials", () => {
    const raw = { ...production, SCREENSHOTS_ENABLED: "true" };
    expect(parseEnv(raw, { requireProductionSecrets: true, role: "scheduler" }).SCREENSHOTS_ENABLED).toBe(true);
    for (const role of ["web", "worker"] as const) {
      expect(() => parseEnv(raw, { requireProductionSecrets: true, role })).toThrow(EnvironmentError);
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

  it.each(["PAYMENTS_ENABLED", "EMAIL_ENABLED", "STORAGE_ENABLED", "ANALYTICS_ENABLED", "SCREENSHOTS_ENABLED"])("requires configuration for enabled %s", (key) => {
    expect(() => parseEnv({ [key]: "true" })).toThrow(EnvironmentError);
  });
  it("rejects a public bucket used for private media", () => {
    expect(() => parseEnv({ R2_BUCKET: "public-media", R2_PRIVATE_BUCKET: "public-media" })).toThrow(EnvironmentError);
  });
  it("rejects provider settings that could become script or endpoint injection", () => {
    for (const settings of [{ GA_MEASUREMENT_ID: "G-TEST';alert(1)" }, { R2_ACCOUNT_ID: "evil.invalid/path" },
      { DATAFAST_DOMAIN: "https://example.com" }, { M365_TENANT_ID: "../common" }, { R2_PUBLIC_BASE_URL: "http://example.com" }]) {
      expect(() => parseEnv(settings)).toThrow(EnvironmentError);
    }
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
