import { cache } from "react";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { sites, speedTests, siteCategories, categories, siteTechnologies, technologies, founderSites, founders, siteScreenshots } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { getSiteRankingPositions } from "@/modules/rankings/service";
import { PERFORMANCE_METHOD_VERSION } from "@/modules/performance/service";
import { hasSiteProAccess } from "@/modules/payments/entitlements";
import { z } from "zod";

export const getSiteProfile = cache(async (slug: string, strategy: "mobile" | "desktop" = "mobile", method?: string, screenshotCursor?: string) => {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "This website report is temporarily unavailable.", 503);
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) return null;
  if (!site.isListed || site.archivedAt || !["active", "verified", "unreachable", "redirected", "parked"].includes(site.lifecycle)) {
    const session = await auth();
    if (!site.ownerId || session?.user?.id !== site.ownerId) return null;
  }
  if(screenshotCursor && !z.uuid().safeParse(screenshotCursor).success)return null;
  const [captureAfter]=screenshotCursor?await db.select({id:siteScreenshots.id,at:siteScreenshots.capturedAt}).from(siteScreenshots)
    .where(and(eq(siteScreenshots.id,screenshotCursor),eq(siteScreenshots.siteId,site.id),eq(siteScreenshots.device,strategy))):[];
  if(screenshotCursor && !captureAfter)return null;
  const methods = await db.selectDistinct({ value: speedTests.methodologyVersion }).from(speedTests)
    .where(and(eq(speedTests.siteId, site.id), eq(speedTests.strategy, strategy))).orderBy(asc(speedTests.methodologyVersion)).limit(20);
  const requestedMethod = method && methods.some((row) => row.value === method) ? method : undefined;
  const [latest] = await db.select().from(speedTests).where(and(eq(speedTests.siteId, site.id), eq(speedTests.strategy, strategy), requestedMethod ? eq(speedTests.methodologyVersion, requestedMethod) : undefined))
    .orderBy(desc(speedTests.testedAt), asc(speedTests.id)).limit(1);
  const [history, categoryRows, technologyRows, founderRows, screenshots, rankingPositions, streakDays, isPro] = await Promise.all([
    latest ? db.select({ score: speedTests.score, testedAt: speedTests.testedAt }).from(speedTests)
      .where(and(eq(speedTests.siteId, site.id), eq(speedTests.strategy, strategy), eq(speedTests.methodologyVersion, latest.methodologyVersion)))
      .orderBy(desc(speedTests.testedAt), asc(speedTests.id)).limit(365) : Promise.resolve([]),
    db.select({ slug: categories.slug, name: categories.name }).from(siteCategories).innerJoin(categories, eq(categories.id, siteCategories.categoryId))
      .where(and(eq(siteCategories.siteId, site.id), eq(categories.active, true))).orderBy(asc(categories.name)),
    db.select({ slug: technologies.slug, name: technologies.name, source: siteTechnologies.source }).from(siteTechnologies).innerJoin(technologies, eq(technologies.id, siteTechnologies.technologyId))
      .where(and(eq(siteTechnologies.siteId, site.id), eq(technologies.active, true))).orderBy(asc(technologies.name)),
    db.select({ slug: founders.slug, name: founders.name }).from(founderSites).innerJoin(founders, eq(founders.id, founderSites.founderId))
      .where(and(eq(founderSites.siteId, site.id), eq(founders.visibility, "public"))).orderBy(asc(founders.name)),
    db.select({ id:siteScreenshots.id,url:siteScreenshots.publicUrl,width:siteScreenshots.width,height:siteScreenshots.height,
      capturedAt:siteScreenshots.capturedAt,device:siteScreenshots.device,mode:siteScreenshots.mode }).from(siteScreenshots)
      .where(and(eq(siteScreenshots.siteId,site.id),eq(siteScreenshots.status,"ready"),eq(siteScreenshots.device,strategy),
        sql`${siteScreenshots.capturedAt}<=now()`,or(isNull(siteScreenshots.retentionUntil),gt(siteScreenshots.retentionUntil,sql`now()`)),
        captureAfter?sql`(${siteScreenshots.capturedAt},${siteScreenshots.id})<(${captureAfter.at.toISOString()}::timestamptz,${captureAfter.id}::uuid)`:undefined))
      .orderBy(desc(siteScreenshots.capturedAt),desc(siteScreenshots.id)).limit(13),
    getSiteRankingPositions(site.id,strategy),
    db.execute<{day:string;score:number}>(sql`SELECT * FROM(SELECT DISTINCT ON((tested_at AT TIME ZONE 'UTC')::date)
      ((tested_at AT TIME ZONE 'UTC')::date)::text AS day,score FROM speed_tests WHERE site_id=${site.id} AND strategy=${strategy}
        AND methodology_version=${PERFORMANCE_METHOD_VERSION} AND metrics_source='lab' AND sample_count>=2 AND tested_at<=now()
        AND score BETWEEN 0 AND 100 AND lcp_ms>=0 AND cls BETWEEN 0 AND 3600000 AND tbt_ms>=0
      ORDER BY (tested_at AT TIME ZONE 'UTC')::date DESC,tested_at DESC,id) daily LIMIT 365`),
    hasSiteProAccess(site.id),
  ]);
  let streak=0;
  for(const day of streakDays){
    if(day.score<90 || (streak>0 && Date.parse(streakDays[streak-1].day)-Date.parse(day.day)!==86_400_000))break;
    streak++;
  }
  return { site: { id:site.id,slug:site.slug,name:site.name,url:site.url,description:site.description,
    tagline:site.tagline,countryCode:site.countryCode,lifecycle:site.lifecycle,isListed:site.isListed,redirectUrl:site.redirectUrl,
    archivedAt:site.archivedAt,createdAt:site.createdAt,lastTestedAt:site.lastTestedAt,badgeStatus:site.badgeStatus,
    badgeCheckedAt:site.badgeCheckedAt,badgeGraceUntil:site.badgeGraceUntil,badgeRequired:site.requiresBadge&&!isPro },
    latest: latest ? { score:latest.score,lcpMs:latest.lcpMs,cls:latest.cls,tbtMs:latest.tbtMs,
      fcpMs:latest.fcpMs,ttiMs:latest.ttiMs,siMs:latest.siMs,loadTimeMs:latest.loadTimeMs,
      testedAt:latest.testedAt,sampleCount:latest.sampleCount,methodologyVersion:latest.methodologyVersion,
      strategy:latest.strategy,metricsSource:latest.metricsSource } : null, methods: methods.map((row) => row.value),
    history: history.reverse().map((row) => ({ score: row.score, testedAt: row.testedAt.toISOString() })),
    categories:categoryRows,technologies:technologyRows,founders:founderRows,screenshot:screenshots[0]||null,
    screenshots:screenshots.slice(0,12),nextScreenshotCursor:screenshots.length>12?screenshots[11].id:null,
    rankingPositions,streak:{days:streak,endDay:streak?streakDays[0].day:null,method:PERFORMANCE_METHOD_VERSION} };
});
