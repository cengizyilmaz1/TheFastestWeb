import { describe, expect, it } from "vitest";
import { EnvironmentError, parseEnv } from "./env";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:unit-test-password@database:5432/test",
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
