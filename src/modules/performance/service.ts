import { runPageSpeedTest, type PSIResult } from "@/lib/pagespeed";
import { AppError } from "@/lib/http/errors";

export const PERFORMANCE_METHOD_VERSION = "psi-v2-two-sample";
export type PerformanceStrategy = "mobile" | "desktop";
export type PerformanceResult = PSIResult & {
  sampleCount: 2;
  metricsSource: "lab";
  methodologyVersion: typeof PERFORMANCE_METHOD_VERSION;
};
const formatMs = (value: number) => value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;

/** Two observations have the same arithmetic mean and conventional even-sample median. */
export function aggregatePerformanceSamples(samples: readonly PSIResult[]): PerformanceResult {
  if (samples.length !== 2) throw new AppError("UPSTREAM_UNAVAILABLE", "Two complete measurements are required.", 502);
  const keys = ["score", "loadTimeMs", "fcpMs", "lcpMs", "cls", "tbtMs", "siMs", "fcpScore", "lcpScore", "clsScore", "tbtScore", "siScore"] as const;
  for (const sample of samples) {
    if (keys.some((key) => !Number.isFinite(sample[key]) || sample[key] < 0)
      || sample.score > 100 || [sample.fcpScore,sample.lcpScore,sample.clsScore,sample.tbtScore,sample.siScore].some((value)=>value>1)
      || (sample.ttiMs !== null && (!Number.isFinite(sample.ttiMs) || sample.ttiMs < 0))
      || (sample.ttiScore !== null && (!Number.isFinite(sample.ttiScore) || sample.ttiScore<0 || sample.ttiScore>1))) {
      throw new AppError("UPSTREAM_UNAVAILABLE", "PageSpeed returned an incomplete measurement.", 502);
    }
  }
  const [a,b] = samples;
  const mean = (key: typeof keys[number]) => (a[key] + b[key]) / 2;
  const lcpMs = Math.round(mean("lcpMs")), fcpMs = Math.round(mean("fcpMs"));
  const tbtMs = Math.round(mean("tbtMs")), siMs = Math.round(mean("siMs"));
  const ttiMs = a.ttiMs === null || b.ttiMs === null ? null : Math.round((a.ttiMs + b.ttiMs) / 2);
  const cls = mean("cls");
  const versions = [...new Set(samples.map((sample) => sample.lighthouseVersion))];
  return {
    score: Math.round(mean("score")), loadTimeMs: lcpMs, fcpMs, lcpMs, cls, tbtMs, ttiMs, siMs,
    fcpScore: mean("fcpScore"), lcpScore: mean("lcpScore"), clsScore: mean("clsScore"),
    tbtScore: mean("tbtScore"), siScore: mean("siScore"),
    ttiScore: a.ttiScore === null || b.ttiScore === null ? null : (a.ttiScore + b.ttiScore) / 2,
    fcp: formatMs(fcpMs), lcp: formatMs(lcpMs), clsDisplay: cls.toFixed(3), tbt: formatMs(tbtMs),
    tti: ttiMs === null ? "Unavailable" : formatMs(ttiMs), si: formatMs(siMs), loadTime: formatMs(lcpMs),
    lighthouseVersion: versions.join(" / "),
    rawResponse: { lighthouseVersions: versions, sampleCount: 2 },
    sampleCount: 2, metricsSource: "lab", methodologyVersion: PERFORMANCE_METHOD_VERSION,
  };
}

/** Both reservations/calls settle before returning; a partial batch is never published. */
export async function runPerformanceTest(url: string, strategy: PerformanceStrategy = "mobile"): Promise<PerformanceResult> {
  const results = await Promise.allSettled([runPageSpeedTest(url, strategy), runPageSpeedTest(url, strategy)]);
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  return aggregatePerformanceSamples(results.map((result) => (result as PromiseFulfilledResult<PSIResult>).value));
}
