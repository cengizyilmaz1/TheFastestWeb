import { z } from "zod";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { resolvePublicTarget } from "@/lib/security/public-url";
import { consumePageSpeedBudget } from "@/modules/jobs/provider-budget";

const PSI_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
export const METHODOLOGY_VERSION = "psi-v1-single-mobile";
const metric = z.object({ numericValue: z.number().finite().min(0).max(3_600_000), score: z.number().min(0).max(1) });
const lighthouseSchema = z.object({
  lighthouseResult: z.object({
    lighthouseVersion: z.string().max(64),
    categories: z.object({ performance: z.object({ score: z.number().min(0).max(1) }) }),
    audits: z.object({
      "first-contentful-paint": metric, "largest-contentful-paint": metric,
      "cumulative-layout-shift": metric, "total-blocking-time": metric,
      "speed-index": metric,
      // New Lighthouse releases may omit deprecated TTI; never fabricate zero.
      interactive: metric.nullish(),
    }),
  }),
});
const formatMs = (value: number) => value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;

export function parsePageSpeedResponse(input: unknown) {
  const parsed = lighthouseSchema.safeParse(input);
  if (!parsed.success) throw new AppError("UPSTREAM_UNAVAILABLE", "PageSpeed did not return a complete measurement. Please try again.", 502);
  const l = parsed.data.lighthouseResult, a = l.audits;
  const fcp = a["first-contentful-paint"], lcp = a["largest-contentful-paint"];
  const cls = a["cumulative-layout-shift"], tbt = a["total-blocking-time"];
  const si = a["speed-index"], tti = a.interactive;
  const fcpMs = Math.round(fcp.numericValue), lcpMs = Math.round(lcp.numericValue);
  const tbtMs = Math.round(tbt.numericValue), siMs = Math.round(si.numericValue);
  const ttiMs = tti ? Math.round(tti.numericValue) : null;
  return {
    score: Math.round(l.categories.performance.score * 100),
    loadTimeMs: lcpMs, fcpMs, lcpMs, cls: cls.numericValue, tbtMs, ttiMs, siMs,
    fcpScore: fcp.score, lcpScore: lcp.score, clsScore: cls.score,
    tbtScore: tbt.score, ttiScore: tti?.score ?? null, siScore: si.score,
    fcp: formatMs(fcpMs), lcp: formatMs(lcpMs), clsDisplay: cls.numericValue.toFixed(3),
    tbt: formatMs(tbtMs), tti: ttiMs === null ? "Unavailable" : formatMs(ttiMs), si: formatMs(siMs),
    loadTime: formatMs(lcpMs), lighthouseVersion: l.lighthouseVersion,
    rawResponse: { lighthouseVersion: l.lighthouseVersion } as Record<string, unknown>,
  };
}
export type PSIResult = ReturnType<typeof parsePageSpeedResponse>;

async function fetchPSI(url: string, strategy: "mobile" | "desktop", apiKey: string | undefined): Promise<PSIResult> {
  await consumePageSpeedBudget();
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  if (apiKey) params.set("key", apiKey);
  let response: Response;
  try {
    response = await fetch(`${PSI_API}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new AppError("UPSTREAM_UNAVAILABLE", "PageSpeed is temporarily unavailable. Please try again.", 502);
  }
  if (!response.ok) {
    await response.body?.cancel();
    const error = new AppError("UPSTREAM_UNAVAILABLE", "PageSpeed could not measure this website. Please try again.", response.status === 429 ? 503 : 502);
    Object.assign(error, { upstreamStatus: response.status });
    throw error;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("UPSTREAM_UNAVAILABLE", "PageSpeed returned no measurement.", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12 * 1024 * 1024) throw new AppError("UPSTREAM_UNAVAILABLE", "PageSpeed returned an oversized response.", 502);
      chunks.push(value);
    }
    return parsePageSpeedResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AppError) throw error;
    throw new AppError("UPSTREAM_UNAVAILABLE", "PageSpeed returned an invalid measurement.", 502);
  } finally { reader.releaseLock(); }
}

export async function runPageSpeedTest(url: string, strategy: "mobile" | "desktop" = "mobile"): Promise<PSIResult> {
  // Every call, including retests, applies the same public-address policy.
  const target = await resolvePublicTarget(url);
  const env = getEnv();
  try { return await fetchPSI(target.url.href, strategy, env.GOOGLE_PSI_API_KEY); }
  catch (error) {
    const status = (error as { upstreamStatus?: number }).upstreamStatus;
    if (env.GOOGLE_PSI_API_KEY_BACKUP && status && [403, 429, 500, 502, 503].includes(status)) {
      return fetchPSI(target.url.href, strategy, env.GOOGLE_PSI_API_KEY_BACKUP);
    }
    throw error;
  }
}
// Compatibility name only: M1 records ONE sample. Multi-run methodology is M4.
export const runStableSpeedTest = runPageSpeedTest;
