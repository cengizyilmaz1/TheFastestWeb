import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PSIResult } from "@/lib/pagespeed";
const { psi } = vi.hoisted(() => ({ psi: vi.fn() }));
vi.mock("@/lib/pagespeed", () => ({ runPageSpeedTest: psi }));
import { aggregatePerformanceSamples, runPerformanceTest } from "./service";

const sample: PSIResult = {
  score: 90,loadTimeMs: 1000,fcpMs: 600,lcpMs: 1000,cls: 0.1,tbtMs: 20,ttiMs: 1100,siMs: 900,
  fcpScore: 0.9,lcpScore: 0.9,clsScore: 0.9,tbtScore: 0.9,ttiScore: 0.9,siScore: 0.9,
  fcp: "600ms",lcp: "1s",clsDisplay: "0.100",tbt: "20ms",tti: "1.1s",si: "900ms",loadTime: "1s",
  lighthouseVersion: "13.0.0",rawResponse: {},
};
beforeEach(() => psi.mockReset().mockResolvedValue(sample));
describe("versioned two-sample lab methodology", () => {
  it("averages both validated observations and derives displays from aggregate metrics", () => {
    const result = aggregatePerformanceSamples([sample,{ ...sample,score: 95,lcpMs: 1501,fcpMs: 1000,cls: 0.3,tbtMs: 40,ttiMs: 1300 }]);
    expect(result).toMatchObject({ score: 93,lcpMs: 1251,loadTimeMs: 1251,fcpMs: 800,cls: 0.2,tbtMs: 30,ttiMs: 1200,
      lcp: "1.3s",loadTime: "1.3s",sampleCount: 2,metricsSource: "lab",methodologyVersion: "psi-v2-two-sample" });
  });
  it("preserves unavailable TTI instead of treating a missing observation as zero", () => {
    expect(aggregatePerformanceSamples([sample,{ ...sample,ttiMs: null,ttiScore: null }])).toMatchObject({ ttiMs: null,ttiScore: null,tti: "Unavailable" });
  });
  it("uses the same chosen strategy for both provider requests", async () => {
    await runPerformanceTest("https://example.com/","desktop");
    expect(psi.mock.calls).toEqual([["https://example.com/","desktop"],["https://example.com/","desktop"]]);
  });
  it("settles the complete batch before surfacing a failure and never accepts one sample", async () => {
    let release!: () => void;
    psi.mockRejectedValueOnce(new Error("First sample failed"));
    psi.mockImplementationOnce(() => new Promise((resolve) => { release=() => resolve(sample); }));
    let settled=false;
    const pending = runPerformanceTest("https://example.com/").finally(() => { settled=true; });
    const assertion = expect(pending).rejects.toThrow("First sample failed");
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await assertion;
    expect(() => aggregatePerformanceSamples([sample])).toThrow();
    expect(() => aggregatePerformanceSamples([sample,{ ...sample,score: NaN }])).toThrow();
  });
});
