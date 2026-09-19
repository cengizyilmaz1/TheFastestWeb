import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getDb } from "@/db/index";
import { sites, speedTests, Site } from "@/db/schema";
import { FaviconImg } from "@/components/ui/FaviconImg";
import { eq, desc, sql } from "drizzle-orm";
import { HistoryChart } from "@/components/site-detail/HistoryChart";
import { MetricsGrid } from "@/components/site-detail/MetricsGrid";

export const revalidate = 3600;

async function getSiteBySlug(slug: string): Promise<Site | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const [row] = await db
      .select()
      .from(sites)
      .where(eq(sites.slug, slug))
      .limit(1);
    return row || null;
  } catch (err) {
    console.error("DB lookup failed:", err);
    return null;
  }
}

async function getSiteRank(siteScore: number): Promise<number> {
  const db = getDb();
  if (!db) return 1;

  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sites)
      .where(sql`${sites.currentScore} > ${siteScore}`);
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
  fcpMs: number;
  lcpMs: number;
  cls: number;
  tbtMs: number;
  ttiMs: number;
  siMs: number;
}

async function getTestData(siteId: string) {
  const db = getDb();
  if (!db || siteId.startsWith("seed-"))
    return { history: [] as TestHistoryPoint[], latest: null as LatestMetrics | null, testCount: 0 };

  try {
    // Get all test history (for chart)
    const allTests = await db
      .select({
        score: speedTests.score,
        testedAt: speedTests.testedAt,
      })
      .from(speedTests)
      .where(eq(speedTests.siteId, siteId))
      .orderBy(speedTests.testedAt);

    // Get latest test with full metrics
    const [latestTest] = await db
      .select()
      .from(speedTests)
      .where(eq(speedTests.siteId, siteId))
      .orderBy(desc(speedTests.testedAt))
      .limit(1);

    const history: TestHistoryPoint[] = allTests.map((t) => ({
      score: t.score,
      testedAt: t.testedAt.toISOString(),
    }));

    const latest: LatestMetrics | null = latestTest
      ? {
          score: latestTest.score,
          fcpMs: latestTest.fcpMs ?? 0,
          lcpMs: latestTest.lcpMs ?? 0,
          cls: latestTest.cls ?? 0,
          tbtMs: latestTest.tbtMs ?? 0,
          ttiMs: latestTest.ttiMs ?? 0,
          siMs: latestTest.siMs ?? 0,
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
  if (!site) return {};

  const domain = new URL(site.url).hostname;
  const title = `How fast is ${domain}? PageSpeed Score: ${site.currentScore}/100`;
  const description = `We track ${site.name}'s PageSpeed score daily. Currently ${site.currentScore}/100${site.currentLoadTime ? `, load time ${site.currentLoadTime}` : ""}${site.currentLcp ? `, LCP ${site.currentLcp}` : ""}${site.currentCls ? `, CLS ${site.currentCls}` : ""}. See full history and Core Web Vitals on TheFastestWeb.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://thefastestweb.site/site/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://thefastestweb.site/site/${slug}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const rank = await getSiteRank(site.currentScore);
  const { history, latest, testCount } = await getTestData(site.id);
  const trend = site.trend ?? 0;

  // Format latest metrics for display
  const formatMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
  const latestMetrics = latest ? {
    fcp: formatMs(latest.fcpMs),
    lcp: formatMs(latest.lcpMs),
    cls: latest.cls.toFixed(3),
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${site.name} Speed Report`,
    description: site.description,
    url: `https://thefastestweb.site/site/${site.slug}`,
    mainEntity: {
      "@type": "WebSite",
      name: site.name,
      url: site.url,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "TheFastestWeb", item: "https://thefastestweb.site" },
        { "@type": "ListItem", position: 2, name: "Websites", item: "https://thefastestweb.site" },
        { "@type": "ListItem", position: 3, name: site.name, item: `https://thefastestweb.site/site/${site.slug}` },
      ],
    },
  };

  return (
    <div className="py-[30px] px-5 pb-[50px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
                  href={`https://x.com/intent/tweet?text=${encodeURIComponent(`${site.name} scored ${site.currentScore}/100 on TheFastestWeb`)}&url=${encodeURIComponent(`https://thefastestweb.site/site/${site.slug}`)}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-bg-card border border-border text-text-primary font-semibold text-[0.82rem] cursor-pointer transition-all duration-200 font-body no-underline hover:bg-bg-card-hover hover:border-border-light whitespace-nowrap"
                >
                  Share on X
                </a>
                <a
                  href={`${site.url}${site.url.includes("?") ? "&" : "?"}ref=thefastestweb`}
                  target="_blank"
                  rel={site.tier === "pro" ? "dofollow" : "nofollow noopener"}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-bg-card border border-border text-text-primary font-semibold text-[0.82rem] cursor-pointer transition-all duration-200 font-body no-underline hover:bg-bg-card-hover hover:border-border-light whitespace-nowrap"
                >
                  Visit ↗
                </a>
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
            {site.ownerId ? (
              <Link
                href={`/profile/${site.ownerId}`}
                className="inline-flex items-center gap-2 no-underline text-inherit hover:text-accent transition-colors"
              >
                {site.twitterHandle ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/avatar/${site.twitterHandle.replace("@", "")}`}
                    alt={site.ownerName}
                    className="w-[34px] h-[34px] rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="w-[34px] h-[34px] rounded-full bg-bg-elevated flex items-center justify-center text-[11px] font-bold text-text-muted">
                    {site.ownerName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                )}
                {site.ownerName}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="w-[34px] h-[34px] rounded-full bg-bg-elevated flex items-center justify-center text-[11px] font-bold text-text-muted">
                  {site.ownerName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
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
