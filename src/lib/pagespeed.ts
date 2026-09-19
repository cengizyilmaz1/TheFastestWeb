const PSI_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface PSIResult {
  score: number;
  loadTimeMs: number;
  fcpMs: number;
  lcpMs: number;
  cls: number;
  tbtMs: number;
  ttiMs: number;
  siMs: number;
  fcpScore: number;
  lcpScore: number;
  clsScore: number;
  tbtScore: number;
  ttiScore: number;
  siScore: number;
  fcp: string;
  lcp: string;
  clsDisplay: string;
  tbt: string;
  tti: string;
  si: string;
  loadTime: string;
  rawResponse: Record<string, unknown>;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Errors that indicate an API key issue (should try backup key)
const RETRYABLE_STATUSES = new Set([429, 403, 500, 502, 503]);

async function fetchPSI(
  url: string,
  strategy: "mobile" | "desktop",
  apiKey: string | undefined
): Promise<PSIResult> {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  if (apiKey) params.set("key", apiKey);

  const response = await fetch(`${PSI_API}?${params}`, {
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    const detail = errBody?.error?.message || "";

    if (response.status === 400) {
      throw new Error(
        detail.includes("DNS") || detail.includes("resolve")
          ? "Could not reach this website. Check the URL and try again."
          : `Could not test this site — it may be unreachable or blocking crawlers. (${response.status})`
      );
    }

    // For retryable errors, throw with status so caller can decide to retry
    const err = new Error(
      response.status === 429
        ? "Rate limited — too many tests. Please wait and try again."
        : `PageSpeed API error (${response.status})`
    );
    (err as Error & { status: number }).status = response.status;
    throw err;
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "PageSpeed API error");
  }

  const lighthouse = data.lighthouseResult;
  const categories = lighthouse.categories;
  const audits = lighthouse.audits;

  const score = Math.round((categories.performance.score || 0) * 100);
  const fcp = audits["first-contentful-paint"];
  const lcp = audits["largest-contentful-paint"];
  const cls = audits["cumulative-layout-shift"];
  const tbt = audits["total-blocking-time"];
  const si = audits["speed-index"];
  const tti = audits["interactive"];

  const fcpMs = fcp?.numericValue ? Math.round(fcp.numericValue) : 0;
  const lcpMs = lcp?.numericValue ? Math.round(lcp.numericValue) : 0;
  const clsVal = cls?.numericValue ?? 0;
  const tbtMs = tbt?.numericValue ? Math.round(tbt.numericValue) : 0;
  const siMs = si?.numericValue ? Math.round(si.numericValue) : 0;
  const ttiMs = tti?.numericValue ? Math.round(tti.numericValue) : 0;
  const loadTimeMs = lcpMs;

  return {
    score,
    loadTimeMs,
    fcpMs,
    lcpMs,
    cls: clsVal,
    tbtMs,
    ttiMs,
    siMs,
    fcpScore: fcp?.score ?? 0,
    lcpScore: lcp?.score ?? 0,
    clsScore: cls?.score ?? 0,
    tbtScore: tbt?.score ?? 0,
    ttiScore: tti?.score ?? 0,
    siScore: si?.score ?? 0,
    fcp: fcp?.displayValue || formatMs(fcpMs),
    lcp: lcp?.displayValue || formatMs(lcpMs),
    clsDisplay: cls?.displayValue || clsVal.toFixed(3),
    tbt: tbt?.displayValue || formatMs(tbtMs),
    tti: tti?.displayValue || formatMs(ttiMs),
    si: si?.displayValue || formatMs(siMs),
    loadTime: formatMs(loadTimeMs),
    rawResponse: data,
  };
}

export async function runPageSpeedTest(
  url: string,
  strategy: "mobile" | "desktop" = "mobile"
): Promise<PSIResult> {
  const primaryKey = process.env.GOOGLE_PSI_API_KEY;
  const backupKey = process.env.GOOGLE_PSI_API_KEY_BACKUP;

  try {
    return await fetchPSI(url, strategy, primaryKey);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    // Only retry with backup for API key / server issues, not client errors (400)
    if (backupKey && status && RETRYABLE_STATUSES.has(status)) {
      console.log(`[PSI] Primary key failed (${status}), trying backup key for ${url}`);
      return await fetchPSI(url, strategy, backupKey);
    }
    throw err;
  }
}

export async function runStableSpeedTest(
  url: string,
  strategy: "mobile" | "desktop" = "mobile"
): Promise<PSIResult> {
  return runPageSpeedTest(url, strategy);
}
