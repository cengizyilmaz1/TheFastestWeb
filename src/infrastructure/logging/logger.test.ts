import { describe, expect, it, vi } from "vitest";
import { sanitizeLogValue } from "./logger";

describe("structured log sanitization", () => {
  it("redacts secret and PII fields recursively", () => {
    expect(sanitizeLogValue({
      event: "unit.test",
      nested: { AUTH_SECRET: "test-only", email: "person@example.test", ip: "192.0.2.1" },
      headers: { authorization: "Bearer test-only" },
    })).toEqual({
      event: "unit.test",
      nested: { AUTH_SECRET: "[REDACTED]", email: "[REDACTED]", ip: "[REDACTED]" },
      headers: "[REDACTED]",
    });
  });

  it("never serializes raw provider error messages or stacks", () => {
    expect(sanitizeLogValue(new Error("Credentials leaked: test-only"))).toEqual({ type: "Error" });
  });

  it("removes URLs and common PII from free-form diagnostic strings", () => {
    const result = sanitizeLogValue("Failure postgresql://app:test-only@database/test person@example.test 192.0.2.10");
    expect(result).not.toContain("test-only");
    expect(result).not.toContain("person@example.test");
    expect(result).not.toContain("192.0.2.10");
  });

  it("bounds recursive and cyclic payloads", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => sanitizeLogValue(value)).not.toThrow();
    expect(JSON.stringify(sanitizeLogValue(value))).toContain("[TRUNCATED]");
  });

  it("redacts Redis connections and configured Redis passwords", () => {
    vi.stubEnv("REDIS_PASSWORD", "synthetic-redis-password-with-no-prefix");
    try {
      expect(sanitizeLogValue({ REDIS_URL: "redis://app:test@redis/0" })).toEqual({ REDIS_URL: "[REDACTED]" });
      expect(sanitizeLogValue("connect rediss://app:private-value@redis/0"))
        .toBe("connect [REDACTED_URL]");
      expect(sanitizeLogValue("failure: synthetic-redis-password-with-no-prefix"))
        .toBe("failure: [REDACTED_SECRET]");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("removes configured secrets even when embedded in an unstructured message", () => {
    vi.stubEnv("AUTH_SECRET", "synthetic-secret-without-a-provider-prefix");
    try {
      expect(sanitizeLogValue("failure: synthetic-secret-without-a-provider-prefix"))
        .toBe("failure: [REDACTED_SECRET]");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
