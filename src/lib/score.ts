import { getDb } from "@/db/index";
import { sites, speedTests } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Update the site's currentScore from the latest speed test.
 */
export async function recalcAverageScore(siteId: string) {
  const db = getDb();
  if (!db) return;

  const [latest] = await db
    .select({
      score: speedTests.score,
      fcpMs: speedTests.fcpMs,
      tbtMs: speedTests.tbtMs,
    })
    .from(speedTests)
    .where(eq(speedTests.siteId, siteId))
    .orderBy(desc(speedTests.testedAt))
    .limit(1);

  if (!latest) return;

  const score = latest.score ?? 0;
  const loadTimeMs = (latest.fcpMs ?? 0) + (latest.tbtMs ?? 0);

  await db
    .update(sites)
    .set({
      currentScore: score,
      currentLoadTime: loadTimeMs ? `${(loadTimeMs / 1000).toFixed(1)}s` : null,
    })
    .where(eq(sites.id, siteId));

  return score;
}
