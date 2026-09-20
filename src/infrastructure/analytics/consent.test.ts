import { describe, expect, it, vi } from "vitest";
import { checkoutAnalyticsConsent, isAnalyticsOrigin, isAnalyticsPage, isPaymentAttributionEligible, readAnalyticsConsent } from "./consent";
import { minorToMajor } from "./datafast";
vi.mock("@/config/env", () => ({ getEnv: () => ({ ANALYTICS_ENABLED: false }) }));
describe("cookieless analytics and legacy opt-out", () => {
  it("permits the canonical browser origin only, including its protocol and port", () => {
    const canonical = "https://example.test";
    expect(isAnalyticsOrigin(canonical, canonical)).toBe(true);
    for (const origin of ["https://preview.example.test", "https://example.test.attacker.test", "http://example.test",
      "https://example.test:8443", "http://localhost:3100", "https://example.test/path", ""]) {
      expect(isAnalyticsOrigin(origin, canonical)).toBe(false);
    }
    expect(isAnalyticsOrigin(canonical, undefined)).toBe(false);
    expect(isAnalyticsOrigin("", "")).toBe(false);
  });
  it("defaults to no consent and honors GPC/DNT over a prior opt-in", () => {
    expect(readAnalyticsConsent("")).toBe("unset");
    expect(readAnalyticsConsent("tfw_analytics_v1=granted", { gpc: true })).toBe("denied");
    expect(readAnalyticsConsent("tfw_analytics_v1=granted", { dnt: "1" })).toBe("denied");
    expect(readAnalyticsConsent("tfw_analytics_v1=granted")).toBe("granted");
  });
  it("excludes private paths and every query string", () => {
    expect(isAnalyticsPage("/unsubscribe", "token=secret")).toBe(false);
    expect(isAnalyticsPage("/dashboard", "")).toBe(false);
    expect(isAnalyticsPage("/profile/00000000-0000-4000-8000-000000000001", "")).toBe(false);
    expect(isAnalyticsPage("/", "email=private")).toBe(false);
    expect(isAnalyticsPage("/sites/example", "")).toBe(true);
    for (const path of ["/%70rofile/account", "/prof%69le/account", "/PROFILE/account", "/%2570rofile/account", "/a/../profile/account", "/%2fprofile/account"]) {
      expect(isAnalyticsPage(path, "")).toBe(false);
    }
  });
  it("uses an explicit validated cookieless header and never reuses legacy cookie identifiers", () => {
    const visitor = "00000000-0000-4000-8000-000000000001";
    expect(checkoutAnalyticsConsent(new Request("https://example.com", { headers: { cookie: `tfw_analytics_v1=granted; datafast_visitor_id=${visitor}` } }))).toEqual({ consent: false });
    expect(checkoutAnalyticsConsent(new Request("https://example.com", { headers: { cookie: `datafast_visitor_id=${visitor}` } }))).toEqual({ consent: false });
    const headers = { "x-tfw-analytics-mode": "cookieless", "x-tfw-datafast-visitor": visitor };
    expect(checkoutAnalyticsConsent(new Request("https://example.com", { headers }))).toEqual({ consent: false, eligible: true, mode: "cookieless", visitorId: visitor });
    for (const extra of [{ "sec-gpc": "1" }, { dnt: "1" }, { cookie: "tfw_analytics_v1=denied" }, { "x-tfw-datafast-visitor": "user@example.com" }, { "x-tfw-analytics-mode": "granted" }] as Record<string, string>[]) {
      expect(checkoutAnalyticsConsent(new Request("https://example.com", { headers: { ...headers, ...extra } }))).toEqual({ consent: false });
    }
  });
  it("distinguishes cookieless eligibility from actual legacy consent and permits revocation", () => {
    const analyticsVisitorId = "00000000-0000-4000-8000-000000000001";
    expect(isPaymentAttributionEligible({ analyticsVisitorId, analyticsConsent: true })).toBe(true);
    expect(isPaymentAttributionEligible({ analyticsVisitorId, analyticsConsent: false, analyticsMode: "cookieless", analyticsEligible: true })).toBe(true);
    expect(isPaymentAttributionEligible({ analyticsVisitorId, analyticsConsent: false, analyticsMode: "cookieless", analyticsEligible: false })).toBe(false);
    expect(isPaymentAttributionEligible({ analyticsVisitorId, analyticsConsent: false })).toBe(false);
    expect(isPaymentAttributionEligible({ analyticsConsent: true })).toBe(false);
  });
  it.each([[1234, "USD", 12.34], [1234, "JPY", 1234], [1234, "KWD", 1.234]])("uses ISO currency precision %s %s", (amount, currency, expected) => {
    expect(minorToMajor(amount as number, currency as string)).toBe(expected);
  });
});
