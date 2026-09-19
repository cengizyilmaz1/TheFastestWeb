import { describe, expect, it } from "vitest";
import { compareRankingCandidates, getPeriodBounds, parsePeriodKey } from "./algorithm";
describe("ranking-v1 UTC boundaries and deterministic ties", () => {
  it.each([
    ["2021-01-01T23:00:00Z","2020-W53","2020-12-28T00:00:00.000Z","2021-01-04T00:00:00.000Z"],
    ["2026-09-19T23:00:00Z","2026-W38","2026-09-14T00:00:00.000Z","2026-09-21T00:00:00.000Z"],
    ["2026-12-31T23:00:00Z","2026-W53","2026-12-28T00:00:00.000Z","2027-01-04T00:00:00.000Z"],
  ])("uses ISO Monday boundaries for %s", (date,key,start,end) => {
    const period = getPeriodBounds("weekly",date);
    expect(period.periodKey).toBe(key);
    expect(period.startAt.toISOString()).toBe(start);
    expect(period.endAt.toISOString()).toBe(end);
    expect(parsePeriodKey("weekly",key)).toEqual(period);
  });
  it("handles leap months and rejects nonexistent ISO weeks", () => {
    expect(parsePeriodKey("monthly","2024-02").endAt.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(() => parsePeriodKey("weekly","2021-W53")).toThrow();
  });
  it("orders score, lower LCP/CLS/TBT and UUID independently of insertion order", () => {
    const a={ siteId: "a",score: 90,lcpMs: 1000,cls: 0.1,tbtMs: 30 };
    const b={ ...a,siteId: "b" };
    expect(compareRankingCandidates(a,b)).toBeLessThan(0);
    expect(compareRankingCandidates({ ...a,lcpMs: 900 },b)).toBeLessThan(0);
    expect(compareRankingCandidates({ ...a,score: 89 },b)).toBeGreaterThan(0);
    expect(compareRankingCandidates({ ...a,improvement: 2 },{ ...b,improvement: 1 },"improved")).toBeLessThan(0);
  });
});
