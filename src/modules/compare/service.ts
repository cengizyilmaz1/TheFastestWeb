import { cache } from "react";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getSiteProfile } from "@/modules/sites/profile";
import { PERFORMANCE_METHOD_VERSION } from "@/modules/performance/service";
import { chooseComparisonMethod, comparableMeasurements, isPublicComparisonSite, parseComparisonPair, scoreChange } from "./model";

export const getComparison = cache(async (pair: string, strategy: "mobile" | "desktop" = "mobile", requestedMethod?: string) => {
  const parsed = parseComparisonPair(pair);
  if (!parsed) return null;
  let [left, right] = await Promise.all([getSiteProfile(parsed.left, strategy), getSiteProfile(parsed.right, strategy)]);
  // Even a signed-in owner cannot turn private data into a shareable comparison.
  if (!left || !right || !isPublicComparisonSite(left.site) || !isPublicComparisonSite(right.site)) return null;
  const { common, selected } = chooseComparisonMethod(left.methods, right.methods, PERFORMANCE_METHOD_VERSION, requestedMethod);
  if (selected) [left, right] = await Promise.all([getSiteProfile(parsed.left, strategy, selected), getSiteProfile(parsed.right, strategy, selected)]);
  if (!left || !right || !isPublicComparisonSite(left.site) || !isPublicComparisonSite(right.site)) return null;
  const comparable = comparableMeasurements(left.latest, right.latest, strategy, selected);
  const rankings = selected && getDb() ? await getDb()!.execute<{ site_id: string; period_key: string; kind: string; rank: number; score: number }>(sql`
    SELECT DISTINCT ON (r.site_id,p.kind) r.site_id,p.period_key,p.kind,r.rank,r.score
    FROM ranking_snapshots r JOIN competition_periods p ON p.id=r.period_id
    WHERE r.site_id IN (${left.site.id},${right.site.id}) AND r.scope='overall' AND r.scope_key=''
      AND r.strategy=${strategy} AND p.status='closed' AND p.performance_method_version=${selected}
    ORDER BY r.site_id,p.kind,p.start_at DESC,p.id LIMIT 4`) : [];
  const now = Date.now(), fresh = (date: Date) => date.getTime() <= now && now - date.getTime() <= 30 * 86_400_000;
  const indexable = comparable && selected === PERFORMANCE_METHOD_VERSION && [left, right].every((profile) => profile.latest
    && profile.latest.sampleCount >= 2 && fresh(profile.latest.testedAt) && profile.history.length >= 3);
  return { left, right, strategy, method: selected, methods: common, comparable, indexable, canonical: parsed.canonical,
    delta: comparable ? left.latest!.score - right.latest!.score : null,
    leftChange: selected && left.latest?.methodologyVersion === selected ? scoreChange(left.history) : null,
    rightChange: selected && right.latest?.methodologyVersion === selected ? scoreChange(right.history) : null,
    rankings: rankings.map((row) => ({ ...row })) };
});
