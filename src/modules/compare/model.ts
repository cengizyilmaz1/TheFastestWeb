const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COMPARISON_SEPARATOR = "~vs~";
export function comparisonPair(first: string, second: string): string | null {
  if ([first, second].some((value) => !value || value.length > 200 || !slug.test(value)) || first === second) return null;
  return [first, second].sort().join(COMPARISON_SEPARATOR);
}
export function parseComparisonPair(value: string) {
  const parts = value.split(COMPARISON_SEPARATOR);
  if (parts.length !== 2) return null;
  const canonical = comparisonPair(parts[0], parts[1]);
  return canonical ? { left: parts[0], right: parts[1], canonical } : null;
}
export function isPublicComparisonSite(site: { isListed: boolean; archivedAt: unknown; lifecycle: string }) {
  return site.isListed && !site.archivedAt && ["active", "verified", "unreachable", "redirected", "parked"].includes(site.lifecycle);
}
export function chooseComparisonMethod(left: string[], right: string[], preferred: string, requested?: string) {
  const common = [...new Set(left.filter((value) => right.includes(value)))].sort();
  const selected = requested ? common.includes(requested) ? requested : null : common.includes(preferred) ? preferred : common[0] ?? null;
  return { common, selected };
}
export type ComparisonMeasurement = { strategy: string; methodologyVersion: string; metricsSource: string; score: number; sampleCount: number };
export function comparableMeasurements(left: ComparisonMeasurement | null, right: ComparisonMeasurement | null, strategy: string, method: string | null) {
  return Boolean(method && left && right && [left, right].every((value) => value.strategy === strategy && value.methodologyVersion === method
    && value.metricsSource === "lab" && Number.isFinite(value.score) && value.score >= 0 && value.score <= 100 && value.sampleCount >= 1));
}
export function scoreChange(history: { score: number }[]) {
  return history.length >= 2 && history.every((point) => Number.isFinite(point.score) && point.score >= 0 && point.score <= 100)
    ? history.at(-1)!.score - history[0].score : null;
}
