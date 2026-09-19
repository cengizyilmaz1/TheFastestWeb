/** Lab metric thresholds (Lighthouse): at or below `good` is good, above `poor` is poor. Lower is always better. */
export type MetricKey = "lcpMs" | "cls" | "tbtMs" | "fcpMs" | "siMs" | "ttiMs";
export type Band = "good" | "mid" | "poor";

export const METRIC_SPECS: Record<MetricKey, { label: string; info: string; good: number; poor: number; time: boolean }> = {
  lcpMs: { label: "Largest contentful paint", info: "LCP", good: 2500, poor: 4000, time: true },
  cls: { label: "Cumulative layout shift", info: "CLS", good: 0.1, poor: 0.25, time: false },
  tbtMs: { label: "Total blocking time", info: "TBT", good: 200, poor: 600, time: true },
  fcpMs: { label: "First contentful paint", info: "FCP", good: 1800, poor: 3000, time: true },
  siMs: { label: "Speed index", info: "SI", good: 3400, poor: 5800, time: true },
  ttiMs: { label: "Time to interactive", info: "TTI", good: 3800, poor: 7300, time: true },
};

export const BAND_LABEL: Record<Band, string> = { good: "Good", mid: "Needs work", poor: "Poor" };
export const BAND_TONE: Record<Band, string> = { good: "text-green", mid: "text-orange", poor: "text-red" };
export const BAND_DOT: Record<Band, string> = { good: "bg-green", mid: "bg-orange", poor: "bg-red" };

export function isMeasured(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function metricBand(key: MetricKey, value: number | null | undefined): Band | null {
  if (!isMeasured(value)) return null;
  const spec = METRIC_SPECS[key];
  return value <= spec.good ? "good" : value <= spec.poor ? "mid" : "poor";
}

export function scoreBand(score: number | null | undefined): Band | null {
  if (!isMeasured(score)) return null;
  return score >= 90 ? "good" : score >= 50 ? "mid" : "poor";
}

/** Where a value sits on the threshold rule, 0 to 100. The good band takes the first 40%, needs work the next 30%. */
export function metricPosition(key: MetricKey, value: number): number {
  const { good, poor } = METRIC_SPECS[key];
  if (value <= good) return (value / good) * 40;
  if (value <= poor) return 40 + ((value - good) / (poor - good)) * 30;
  return Math.min(100, 70 + ((value - poor) / poor) * 30);
}

/** Splits a duration into a number and its unit so the unit can be set quieter than the value. */
export function formatDuration(value: number | null | undefined): { value: string; unit: string } {
  if (value === null || value === undefined) return { value: "—", unit: "" };
  return value >= 1000 ? { value: (value / 1000).toFixed(2), unit: "s" } : { value: String(value), unit: "ms" };
}

export function formatThreshold(key: MetricKey, value: number): string {
  if (!METRIC_SPECS[key].time) return String(value);
  return value >= 1000 ? `${Number((value / 1000).toFixed(1))}s` : `${value}ms`;
}
