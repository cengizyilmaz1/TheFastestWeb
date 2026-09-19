import { describe, expect, it } from "vitest";
import { parsePageSpeedResponse } from "./pagespeed";
const metric = { numericValue: 1234, score: 0.8 };
function fixture() {
  return { lighthouseResult: { lighthouseVersion: "13.0.0", categories: { performance: { score: 0.92 } }, audits: {
    "first-contentful-paint": metric, "largest-contentful-paint": metric,
    "cumulative-layout-shift": { numericValue: 0, score: 1 }, "total-blocking-time": metric, "speed-index": metric,
  } } };
}
describe("provider measurement validation", () => {
  it("retains real zero CLS and absent TTI without invented metrics", () => {
    const result = parsePageSpeedResponse(fixture());
    expect(result).toMatchObject({ score: 92, cls: 0, ttiMs: null, ttiScore: null, tti: "Unavailable" });
  });
  it("rejects missing/error/null/out-of-range upstream scores", () => {
    for (const score of [undefined, null, -1, 2, NaN]) {
      const data = fixture();
      Object.assign(data.lighthouseResult.categories.performance, { score });
      expect(() => parsePageSpeedResponse(data)).toThrow("complete measurement");
    }
    expect(() => parsePageSpeedResponse({ error: { message: "secret upstream detail" } })).toThrow("complete measurement");
  });
  it("does not retain arbitrary upstream payloads", () => {
    const result = parsePageSpeedResponse({ ...fixture(), secret: "sensitive" });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
});
