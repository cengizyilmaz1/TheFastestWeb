import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { sites, speedTests, cronLogs, users } from "@/db/schema";
import { eq, gte, and } from "drizzle-orm";
import { recalcAverageScore } from "@/lib/score";
import { runStableSpeedTest } from "@/lib/pagespeed";
import { sendEmail } from "@/lib/email/send";
import { speedTrendAlertEmail } from "@/lib/email/templates";
import { desc as descOrder } from "drizzle-orm";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const startedAt = new Date();

  // Create the log entry upfront
  const [logEntry] = await db
    .insert(cronLogs)
    .values({
      totalSites: 0,
      testedCount: 0,
      failedCount: 0,
      startedAt,
    })
    .returning();

  try {
    const allSites = await db
      .select({ id: sites.id, url: sites.url, name: sites.name, slug: sites.slug, currentScore: sites.currentScore, ownerId: sites.ownerId })
      .from(sites);

    const results: { name: string; score: number; oldScore: number; newScore: number; error?: string }[] = [];
    let testedCount = 0;
    let failedCount = 0;

    for (const site of allSites) {
      try {
        // Skip sites already tested today (e.g. newly submitted sites)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const alreadyTested = await db
          .select({ id: speedTests.id })
          .from(speedTests)
          .where(and(eq(speedTests.siteId, site.id), gte(speedTests.testedAt, today)))
          .limit(1);
        if (alreadyTested.length > 0) continue;

        const speedData = await runStableSpeedTest(site.url, "mobile");

        await db.insert(speedTests).values({
          siteId: site.id,
          score: speedData.score,
          loadTimeMs: speedData.loadTimeMs,
          fcpMs: speedData.fcpMs,
          lcpMs: speedData.lcpMs,
          cls: speedData.cls,
          tbtMs: speedData.tbtMs,
          ttiMs: speedData.ttiMs,
          siMs: speedData.siMs,
          strategy: "mobile",
        });

        await db
          .update(sites)
          .set({
            currentFcp: speedData.fcp,
            currentLcp: speedData.lcp,
            currentCls: speedData.clsDisplay,
            currentTbt: speedData.tbt,
            currentTti: speedData.tti,
            currentSi: speedData.si,
            lastTestedAt: new Date(),
          })
          .where(eq(sites.id, site.id));

        const newScore = await recalcAverageScore(site.id) ?? speedData.score;
        const oldScore = site.currentScore;
        const trend = oldScore > 0 ? Math.round(((newScore - oldScore) / oldScore) * 100) : 0;

        await db.update(sites).set({ trend }).where(eq(sites.id, site.id));

        testedCount++;
        results.push({ name: site.name, score: speedData.score, oldScore, newScore });
      } catch (err) {
        failedCount++;
        results.push({
          name: site.name,
          score: 0,
          oldScore: site.currentScore,
          newScore: site.currentScore,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      if (allSites.indexOf(site) < allSites.length - 1) {
        await delay(20000);
      }
    }

    // ── Phase 2: Trend analysis (window comparison) ──
    // Compare avg of last 3 tests vs previous 3 tests. Alert if recent avg is >= 15 points lower.
    const WINDOW_SIZE = 3;
    const MIN_DROP = 15;
    for (const site of allSites) {
      if (!site.ownerId) continue;
      try {
        const recentTests = await db
          .select({ score: speedTests.score, testedAt: speedTests.testedAt })
          .from(speedTests)
          .where(eq(speedTests.siteId, site.id))
          .orderBy(descOrder(speedTests.testedAt))
          .limit(WINDOW_SIZE * 2);

        if (recentTests.length < WINDOW_SIZE * 2) continue;

        const allTests = recentTests.reverse(); // oldest first
        const prevWindow = allTests.slice(0, WINDOW_SIZE);
        const recentWindow = allTests.slice(WINDOW_SIZE);

        const prevAvg = Math.round(prevWindow.reduce((s, t) => s + t.score, 0) / WINDOW_SIZE);
        const recentAvg = Math.round(recentWindow.reduce((s, t) => s + t.score, 0) / WINDOW_SIZE);
        const drop = prevAvg - recentAvg;

        if (drop < MIN_DROP) continue;

        const [owner] = await db.select().from(users).where(eq(users.id, site.ownerId!)).limit(1);
        if (!owner?.email) continue;

        const [siteData] = await db
          .select({ fcp: sites.currentFcp, lcp: sites.currentLcp, cls: sites.currentCls, tbt: sites.currentTbt, si: sites.currentSi })
          .from(sites)
          .where(eq(sites.id, site.id))
          .limit(1);

        const trendDays = allTests.map((s) => ({
          date: s.testedAt ? new Date(s.testedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A",
          score: s.score,
        }));

        const alertEmail = speedTrendAlertEmail(
          owner.name || "there",
          site.name,
          site.slug,
          trendDays,
          siteData ? {
            fcp: siteData.fcp ?? undefined,
            lcp: siteData.lcp ?? undefined,
            cls: siteData.cls ?? undefined,
            tbt: siteData.tbt ?? undefined,
            si: siteData.si ?? undefined,
          } : undefined
        );
        sendEmail(owner.email, alertEmail.subject, alertEmail.html).catch(console.error);
      } catch (e) {
        console.error(`[trend] Error checking trend for ${site.name}:`, e);
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Update log entry with results
    await db
      .update(cronLogs)
      .set({
        totalSites: allSites.length,
        testedCount,
        failedCount,
        durationMs,
        results,
        completedAt,
      })
      .where(eq(cronLogs.id, logEntry.id));

    return NextResponse.json({
      message: `Re-tested ${allSites.length} sites`,
      timestamp: completedAt.toISOString(),
      durationMs,
      testedCount,
      failedCount,
      results,
    });
  } catch (err) {
    // Log the top-level failure
    await db
      .update(cronLogs)
      .set({
        error: err instanceof Error ? err.message : "Unknown error",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      })
      .where(eq(cronLogs.id, logEntry.id));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
