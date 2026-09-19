import { NextResponse } from "next/server";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sites, speedTests, cronLogs, requestRateLimits, verifiedSpeedTests } from "@/db/schema";
import { getEnv } from "@/config/env";
import { isCronAuthorized } from "@/modules/security/request";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { runPageSpeedTest, METHODOLOGY_VERSION } from "@/lib/pagespeed";

// Bounded compatibility trigger until M2's queue owns scheduling. No app scheduler.
export const GET = withApi(async (request) => {
  if (!isCronAuthorized(request.headers.get("authorization"), getEnv().CRON_SECRET)) throw new AppError("UNAUTHORIZED", "Unauthorized.", 401);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Retesting is temporarily unavailable.", 503);
  const startedAt = new Date();
  const outcome = await db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(sql`SELECT pg_try_advisory_xact_lock(hashtextextended('tfw:retest', 0)) AS locked`);
    if (!lock?.locked) return { skipped: true, testedCount: 0 };
    const utcDay = new Date(startedAt);
    utcDay.setUTCHours(0, 0, 0, 0);
    const [site] = await tx.select().from(sites).where(and(
      eq(sites.isListed, true), eq(sites.monitoringPaused, false),
      or(sql`${sites.lastTestedAt} IS NULL`, lt(sites.lastTestedAt, utcDay)),
      sql`NOT EXISTS (
        SELECT 1 FROM cron_logs failure
        WHERE failure.failed_count > 0
          AND failure.started_at > now() - interval '1 hour'
          AND failure.results->>'siteId' = ${sites.id}::text
      )`,
    )).orderBy(asc(sites.lastTestedAt), asc(sites.id)).limit(1).for("update");
    await tx.delete(requestRateLimits).where(lt(requestRateLimits.windowStartedAt, new Date(startedAt.getTime() - 86_400_000)));
    await tx.delete(verifiedSpeedTests).where(lt(verifiedSpeedTests.expiresAt, new Date(startedAt.getTime() - 30 * 86_400_000)));
    if (!site) return { skipped: false, testedCount: 0 };
    let result;
    try {
      result = await runPageSpeedTest(site.url, "mobile");
    } catch {
      // Persist cooldown without changing the last successful measurement.
      // One unreachable oldest site must not starve every other site's retest.
      await tx.insert(cronLogs).values({
        totalSites: 1, testedCount: 0, failedCount: 1, startedAt,
        completedAt: new Date(), durationMs: Date.now() - startedAt.getTime(),
        results: { siteId: site.id, status: "failed" }, error: "UPSTREAM_UNAVAILABLE",
      });
      return { skipped: false, testedCount: 0, failedCount: 1 };
    }
    await tx.insert(speedTests).values({
      siteId: site.id, score: result.score, loadTimeMs: result.loadTimeMs,
      fcpMs: result.fcpMs, lcpMs: result.lcpMs, cls: result.cls, tbtMs: result.tbtMs,
      ttiMs: result.ttiMs, siMs: result.siMs, strategy: "mobile", methodologyVersion: METHODOLOGY_VERSION,
    });
    await tx.update(sites).set({
      currentScore: result.score, currentLoadTime: result.loadTime, currentFcp: result.fcp,
      currentLcp: result.lcp, currentCls: result.clsDisplay, currentTbt: result.tbt,
      currentTti: result.tti, currentSi: result.si, lastTestedAt: new Date(),
      trend: site.currentScore > 0 ? Math.round((result.score - site.currentScore) / site.currentScore * 100) : 0,
    }).where(eq(sites.id, site.id));
    return { skipped: false, testedCount: 1 };
  });
  if (!outcome.failedCount) await db.insert(cronLogs).values({
    totalSites: outcome.testedCount, testedCount: outcome.testedCount, failedCount: 0,
    startedAt, completedAt: new Date(), durationMs: Date.now() - startedAt.getTime(),
  });
  return NextResponse.json(outcome, { headers: { "Cache-Control": "no-store" } });
});
