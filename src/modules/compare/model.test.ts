import { describe, expect, it } from "vitest";
import { chooseComparisonMethod, comparableMeasurements, comparisonPair, isPublicComparisonSite, parseComparisonPair, scoreChange } from "./model";
describe("public comparison boundaries", () => {
  it("has one canonical URL per distinct pair, including slugs containing vs", () => {
    expect(comparisonPair("zebra-vs-ant", "alpha")).toBe("alpha~vs~zebra-vs-ant");
    expect(parseComparisonPair("zebra-vs-ant~vs~alpha")?.canonical).toBe("alpha~vs~zebra-vs-ant");
    expect(comparisonPair("same", "same")).toBeNull();
    expect(parseComparisonPair("alpha~vs~beta~vs~gamma")).toBeNull();
    expect(comparisonPair("../private", "alpha")).toBeNull();
  });
  it("excludes private, archived and suspended sites regardless of session", () => {
    const site = { isListed: true, archivedAt: null, lifecycle: "active" };
    expect(isPublicComparisonSite(site)).toBe(true);
    for (const hidden of [{ isListed: false }, { archivedAt: new Date() }, { lifecycle: "suspended" }]) expect(isPublicComparisonSite({ ...site, ...hidden })).toBe(false);
  });
  it("selects only a method available on both sites and refuses missing requested methods", () => {
    expect(chooseComparisonMethod(["old", "current"], ["current"], "current")).toEqual({ common: ["current"], selected: "current" });
    expect(chooseComparisonMethod(["old"], ["current"], "current").selected).toBeNull();
    expect(chooseComparisonMethod(["old"], ["old"], "current", "current").selected).toBeNull();
  });
  it("never subtracts different devices, methods, field data or missing samples", () => {
    const value = { strategy: "mobile", methodologyVersion: "current", metricsSource: "lab", score: 90, sampleCount: 2 };
    expect(comparableMeasurements(value, { ...value, score: 80 }, "mobile", "current")).toBe(true);
    for (const changed of [{ strategy: "desktop" }, { methodologyVersion: "old" }, { metricsSource: "field" }, { sampleCount: 0 }, { score: NaN }]) {
      expect(comparableMeasurements(value, { ...value, ...changed }, "mobile", "current")).toBe(false);
    }
    expect(comparableMeasurements(value, null, "mobile", "current")).toBe(false);
  });
  it("reports measured score-point improvement only with real comparable history", () => {
    expect(scoreChange([{ score: 0 }, { score: 90 }])).toBe(90);
    expect(scoreChange([{ score: 90 }])).toBeNull();
    expect(scoreChange([{ score: 90 }, { score: -1 }])).toBeNull();
  });
});
