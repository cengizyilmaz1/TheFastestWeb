import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const mocks = vi.hoisted(() => ({ config: { SITE_URL: "https://example.com/", AUTH_URL: undefined as string | undefined, NODE_ENV: "production" } }));
vi.mock("@/config/env", () => ({ getEnv: () => mocks.config }));
import { assertSameOrigin, isCronAuthorized, readJson } from "./request";

beforeEach(() => { mocks.config.SITE_URL = "https://example.com/"; mocks.config.AUTH_URL = undefined; mocks.config.NODE_ENV = "production"; });
describe("same-origin requests", () => {
  it("accepts the canonical origin when configuration has a trailing slash", () => {
    expect(() => assertSameOrigin(new Request("https://example.com/api/submit", { headers: { origin: "https://example.com" } }))).not.toThrow();
  });
  it.each([undefined, "https://attacker.example", "null", "https://example.com.attacker.example"])("denies missing or foreign origin %s in production", (origin) => {
    expect(() => assertSameOrigin(new Request("https://example.com/api/submit", { headers: origin ? { origin } : {} }))).toThrow(expect.objectContaining({ status: 403 }));
  });
  it("does not trust an attacker-controlled request host in production", () => {
    expect(() => assertSameOrigin(new Request("https://attacker.example/api/submit", { headers: { origin: "https://attacker.example" } }))).toThrow(expect.objectContaining({ status: 403 }));
  });
});
describe("cron authorization", () => {
  const secret = "unit-test-only-".repeat(4);
  it("fails closed for absent or incorrect credentials", () => {
    expect(isCronAuthorized(null, undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized(`Bearer ${secret}`, undefined)).toBe(false);
    expect(isCronAuthorized(null, secret)).toBe(false);
    expect(isCronAuthorized("Bearer invalid", secret)).toBe(false);
  });
  it("accepts only an exact bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronAuthorized(`Bearer ${secret} `, secret)).toBe(false);
  });
});
it("rejects oversized input without trusting Content-Length", async () => {
  const request = new Request("https://thefastestweb.site/api/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x".repeat(100) }) });
  await expect(readJson(request, z.object({ name: z.string() }), 20)).rejects.toMatchObject({ status: 413 });
});
it("accepts the JSON Blob used by ad click beacons", async () => {
  const body = new Blob([JSON.stringify({ adId: "ad-example" })], { type: "application/json" });
  await expect(readJson(new Request("https://example.com/api/ad-click", { method: "POST", body }), z.object({ adId: z.string() }))).resolves.toEqual({ adId: "ad-example" });
});
