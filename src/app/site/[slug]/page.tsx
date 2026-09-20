import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { cache } from "react";
import { getDb } from "@/db/index";
import { founders, sites, speedTests } from "@/db/schema";
import { FaviconImg } from "@/components/ui/FaviconImg";
import { Avatar } from "@/components/ui/Avatar";
import { getFounderPath } from "@/modules/founders/paths";
import { OutboundLink } from "@/components/ui/OutboundLink";
import { and, eq, desc, inArray, isNull, sql } from "drizzle-orm";
import { HistoryChart } from "@/components/site-detail/HistoryChart";
import { MetricsGrid } from "@/components/site-detail/MetricsGrid";
import { publicSiteProjection, publiclyActive } from "@/modules/sites/directory";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata, siteUrl } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/structured-data";
import { logger } from "@/infrastructure/logging/logger";
import { getLatestPublicScreenshot } from "@/modules/screenshots/public-view";
import { siteVisitLinkRel } from "@/modules/sites/link-policy";

export const dynamic = "force-dynamic";

const getSiteBySlug = cache(async (slug: string) => {
  const db = getDb();
  if (!db) return null;

  try {
    const [row] = await db
      .select({ ...publicSiteProjection, tier: sites.tier, trend: sites.trend,
        ownerIsAdmin: sql<boolean>`EXISTS (SELECT 1 FROM admin_roles a
          WHERE a.user_id=${sql.identifier("sites")}.${sql.identifier("owner_id")} AND a.role='admin')`,
        currentLoadTime: sites.currentLoadTime, currentFcp: sites.currentFcp, currentTti: sites.currentTti,
        currentSi: sites.currentSi, ownerId: founders.userId, ownerName: founders.name, ownerAvatarUrl: founders.avatarUrl, ownerUsername: founders.slug })
      .from(sites)
      .leftJoin(founders, and(eq(founders.userId, sites.ownerId), eq(founders.visibility, "public")))
      .where(and(eq(sites.slug, slug), eq(sites.isListed, true), isNull(sites.archivedAt),
        inArray(sites.lifecycle, ["active", "verified", "unreachable", "redirected", "parked"])))
      .limit(1);
    return row ? { ...row, ownerName: row.ownerName ?? "Not shared", twitterHandle: null as string | null } : null;
  } catch {
    logger.error({ event: "site.public_lookup_failed", code: "DATABASE_UNAVAILABLE" });
    return null;
  }
});

async function getSiteRank(siteScore: number): Promise<number> {
  const db = getDb();
  if (!db) return 1;

  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sites)
      .where(and(publiclyActive(), sql`${sites.currentScore} > ${siteScore}`));
    return count + 1;
  } catch {
    return 1;
  }
}

interface TestHistoryPoint {
  score: number;
  testedAt: string;
}

interface LatestMetrics {
  score: number;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  ttiMs: number | null;
  siMs: number | null;
}

async function getTestData(siteId: string) {
  const db = getDb();
  if (!db || siteId.startsWith("seed-"))
    return { history: [] as TestHistoryPoint[], latest: null as LatestMetrics | null, testCount: 0 };

  try {
    // Keep this original mobile report within a single measurement method.
    const [latestTest] = await db
      .select({ score: speedTests.score, fcpMs: speedTests.fcpMs, lcpMs: speedTests.lcpMs,
        cls: speedTests.cls, tbtMs: speedTests.tbtMs, ttiMs: speedTests.ttiMs, siMs: speedTests.siMs,
        methodologyVersion: speedTests.methodologyVersion })
      .from(speedTests)
      .where(and(eq(speedTests.siteId, siteId), eq(speedTests.strategy, "mobile")))
      .orderBy(desc(speedTests.testedAt))
      .limit(1);
    if (!latestTest) return { history: [] as TestHistoryPoint[], latest: null as LatestMetrics | null, testCount: 0 };

    const allTests = await db
      .select({
        score: speedTests.score,
        testedAt: speedTests.testedAt,
      })
      .from(speedTests)
      .where(and(eq(speedTests.siteId, siteId), eq(speedTests.strategy, "mobile"),
        eq(speedTests.methodologyVersion, latestTest.methodologyVersion)))
      .orderBy(desc(speedTests.testedAt))
      .limit(365);

    const history: TestHistoryPoint[] = allTests.reverse().map((t) => ({
      score: t.score,
      testedAt: t.testedAt.toISOString(),
    }));

    const latest: LatestMetrics | null = latestTest
      ? {
          score: latestTest.score,
          fcpMs: latestTest.fcpMs,
          lcpMs: latestTest.lcpMs,
          cls: latestTest.cls,
          tbtMs: latestTest.tbtMs,
          ttiMs: latestTest.ttiMs,
          siMs: latestTest.siMs,
        }
      : null;

    return { history, latest, testCount: allTests.length };
  } catch {
    return { history: [] as TestHistoryPoint[], latest: null as LatestMetrics | null, testCount: 0 };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const domain = new URL(site.url).hostname;
  const measured = Boolean(site.lastTestedAt) && Number.isFinite(site.currentScore);
  const title = `${domain} — website speed report`;
  const description = measured
    ? `${site.name} has a recorded mobile PageSpeed score of ${site.currentScore}/100${site.currentLcp ? ` and LCP of ${site.currentLcp}` : ""}. View the last test date, lab metrics and performance history.`
    : `View the public website listing for ${site.name}. No recorded mobile performance score is available yet.`;
  return pageMetadata({ title, description, path: `/site/${encodeURIComponent(slug)}` });
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const [rank, { history, latest }, screenshot] = await Promise.all([
    getSiteRank(site.currentScore), getTestData(site.id), getLatestPublicScreenshot(site.id),
  ]);
  const trend = site.trend ?? 0;

  // Format latest metrics for display
  const formatMs = (ms: number | null) => ms === null ? "N/A" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
  const latestMetrics = latest ? {
    fcp: formatMs(latest.fcpMs),
    lcp: formatMs(latest.lcpMs),
    cls: latest.cls === null ? "N/A" : latest.cls.toFixed(3),
    tbt: formatMs(latest.tbtMs),
    tti: formatMs(latest.ttiMs),
    si: formatMs(latest.siMs),
  } : null;

  const scoreClass =
    site.currentScore >= 97
      ? "text-green"
      : site.currentScore >= 94
        ? "text-accent-bright"
        : "text-orange";

  // faviconUrl is now handled by FaviconImg with fallback chain

  const reportPath = `/site/${encodeURIComponent(site.slug)}`;
  const jsonLd = {
    ...webPageSchema({ path: reportPath, name: `${site.name} speed report`, description: site.description, modified: site.lastTestedAt,
      trail: [{ name: "TheFastestWeb", path: "/" }, { name: site.name, path: reportPath }] }),
    mainEntity: {
      "@type": "WebSite",
      name: site.name,
      url: site.url,
    },
  };

  return (
    <div className="py-[30px] px-5 pb-[50px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[0.8rem] text-text-muted mb-6">
        <Link href="/" className="text-text-muted no-underline hover:text-accent">
          TheFastestWeb
        </Link>
        <span className="text-border-light">&rsaquo;</span>
        <Link href="/" className="text-text-muted no-underline hover:text-accent">
          Websites
        </Link>
        <span className="text-border-light">&rsaquo;</span>
        <span className="text-text-primary">{site.name}</span>
      </div>

      {/* Header */}
      <div className="mb-7">
        <div className="flex items-start gap-4 mb-1.5">
          <div className="w-[64px] h-[64px] rounded-2xl flex items-center justify-center overflow-hidden bg-bg-elevated shrink-0 mt-1 max-[640px]:w-[48px] max-[640px]:h-[48px]">
            <FaviconImg
              url={site.url}
              src={site.faviconUrl || undefined}
              alt={site.name}
              className="w-full h-full object-contain p-2"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="font-display text-[1.9rem] font-[800] tracking-[-0.02em] flex-1 min-w-0 max-[640px]:text-[1.4rem] max-[640px]:flex-none max-[640px]:w-full">
                {site.name}
              </h1>
              <div className="flex gap-2 shrink-0">
                <a
                  href={`https://x.com/intent/tweet?text=${encodeURIComponent(`${site.name} on TheFastestWeb`)}&url=${encodeURIComponent(siteUrl(reportPath))}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-bg-card border border-border text-text-primary font-semibold text-[0.82rem] cursor-pointer transition-all duration-200 font-body no-underline hover:bg-bg-card-hover hover:border-border-light whitespace-nowrap"
                >
                  Share on X
                </a>
                <OutboundLink
                  href={site.url} placement="product" trackingId={site.id}
                  rel={siteVisitLinkRel(site)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-bg-card border border-border text-text-primary font-semibold text-[0.82rem] cursor-pointer transition-all duration-200 font-body no-underline hover:bg-bg-card-hover hover:border-border-light whitespace-nowrap"
                >
                  Visit ↗
                </OutboundLink>
              </div>
            </div>
            <p className="text-text-secondary text-[0.88rem] max-[640px]:text-[0.82rem]">
              {site.description}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3.5 mb-7 max-[640px]:grid-cols-2">
        <div className="bg-bg-card border border-border rounded-[10px] p-4">
          <div className="text-[0.72rem] font-semibold text-text-muted mb-1.5">
            Speed Score
          </div>
          <div className={`font-mono font-[800] text-2xl leading-tight ${scoreClass}`}>
            {site.currentScore}/100
          </div>
          <div className="text-[0.75rem] text-text-muted mt-1">
            #{rank} on TheFastestWeb
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-[10px] p-4">
          <div className="text-[0.72rem] font-semibold text-text-muted mb-1.5">
            Load Time
          </div>
          <div className="font-mono font-[800] text-2xl leading-tight text-text-primary">
            {site.currentLoadTime || "—"}
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-[10px] p-4">
          <div className="text-[0.72rem] font-semibold text-text-muted mb-1.5">
            Built by
          </div>
          <div className="font-display font-bold text-[1.2rem] leading-tight">
            {site.ownerUsername ? (
              <Link
                href={getFounderPath(site.ownerUsername)}
                className="inline-flex items-center gap-2 no-underline text-inherit hover:text-accent transition-colors"
              >
                <Avatar name={site.ownerName} src={site.ownerAvatarUrl} size={34} />
                {site.ownerName}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Avatar name={site.ownerName} size={34} />
                {site.ownerName}
              </span>
            )}
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-[10px] p-4">
          <div className="text-[0.72rem] font-semibold text-text-muted mb-1.5">
            Trend
          </div>
          <div className={`font-mono font-[800] text-2xl leading-tight ${trend >= 0 ? "text-green" : "text-red"}`}>
            {trend >= 0 ? "+" : ""}{trend}%
          </div>
        </div>
      </div>

      {screenshot && (
        <figure className="mb-7 overflow-hidden rounded-[10px] border border-border bg-bg-card">
          <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="font-display text-[0.95rem] font-bold">Website preview</span>
            <time dateTime={screenshot.capturedAt} className="text-[0.75rem] text-text-muted">
              Captured {new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(screenshot.capturedAt))}
            </time>
          </figcaption>
          {/* Sharp has already optimized this verified R2 image; serve it without a second image proxy. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshot.url}
            alt={`${site.name} website screenshot`}
            width={screenshot.width}
            height={screenshot.height}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="block h-auto max-h-[560px] w-full object-contain object-top"
          />
        </figure>
      )}

      {/* History Chart */}
      <HistoryChart
        data={history}
        currentScore={site.currentScore}
        trend={trend}
      />

      {/* Detailed Metrics — from latest test */}
      <MetricsGrid
        fcp={latestMetrics?.fcp ?? site.currentFcp}
        lcp={latestMetrics?.lcp ?? site.currentLcp}
        cls={latestMetrics?.cls ?? site.currentCls}
        tbt={latestMetrics?.tbt ?? site.currentTbt}
        tti={latestMetrics?.tti ?? site.currentTti}
        si={latestMetrics?.si ?? site.currentSi}
        label="Performance Metrics"
      />
    </div>
  );
}
