import { describe, expect, it, vi } from "vitest";
import { checkoutAnalyticsConsent, isAnalyticsPage, readAnalyticsConsent } from "./consent";
import { minorToMajor } from "./datafast";
vi.mock("@/config/env", () => ({ getEnv: () => ({ ANALYTICS_ENABLED: false }) }));
describe("opt-in analytics", () => {
  it("defaults to no consent and honors GPC/DNT over a prior opt-in", () => {
    expect(readAnalyticsConsent("")).toBe("unset");
    expect(readAnalyticsConsent("tfw_analytics_v1=granted", { gpc: true })).toBe("denied");
    expect(readAnalyticsConsent("tfw_analytics_v1=granted", { dnt: "1" })).toBe("denied");
    expect(readAnalyticsConsent("tfw_analytics_v1=granted")).toBe("granted");
  });
  it("excludes private paths and every query string", () => {
    expect(isAnalyticsPage("/unsubscribe", "token=secret")).toBe(false);
    expect(isAnalyticsPage("/dashboard", "")).toBe(false);
    expect(isAnalyticsPage("/", "email=private")).toBe(false);
    expect(isAnalyticsPage("/sites/example", "")).toBe(true);
  });
  it("reads attribution only from consented request cookies", () => {
    const visitor = "00000000-0000-4000-8000-000000000001";
    expect(checkoutAnalyticsConsent(new Request("https://example.com", { headers: { cookie: `tfw_analytics_v1=granted; datafast_visitor_id=${visitor}` } }))).toEqual({ consent: true, visitorId: visitor });
    expect(checkoutAnalyticsConsent(new Request("https://example.com", { headers: { cookie: `datafast_visitor_id=${visitor}` } }))).toEqual({ consent: false });
  });
  it.each([[1234, "USD", 12.34], [1234, "JPY", 1234], [1234, "KWD", 1.234]])("uses ISO currency precision %s %s", (amount, currency, expected) => {
    expect(minorToMajor(amount as number, currency as string)).toBe(expected);
  });
});
