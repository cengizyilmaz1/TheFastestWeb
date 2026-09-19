import { siteConfig } from "@/config/site";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/index";
import { sites, Site } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

export const revalidate = 3600;

const TIERS: Record<string, { minScore: number; exactScore?: number; label: string; title: string; description: (count: number, top: Site | undefined) => string }> = {
  "perfect": {
    minScore: 100,
    exactScore: 100,
    label: "Perfect 100",
    title: "Websites with a Perfect 100 PageSpeed Score | TheFastestWeb",
    description: (count, top) =>
      `${count} website${count !== 1 ? "s" : ""} with a perfect 100/100 Google PageSpeed score, tested daily.${top ? ` Includes ${top.name} and more.` : ""} The fastest sites on the web.`,
  },
  "90-plus": {
    minScore: 90,
    label: "90+ Score",
    title: "Websites Scoring 90+ on PageSpeed | TheFastestWeb",
    description: (count, top) =>
      `${count} websites scoring 90 or above on Google PageSpeed, ranked and updated daily.${top ? ` Top scorer: ${top.name} at ${top.currentScore}/100.` : ""} Elite performance tier.`,
  },
  "80-plus": {
    minScore: 80,
    label: "80+ Score",
    title: "Websites Scoring 80+ on PageSpeed | TheFastestWeb",
    description: (count, top) =>
      `${count} websites scoring 80 or above on Google PageSpeed, ranked and updated daily.${top ? ` Top scorer: ${top.name} at ${top.currentScore}/100.` : ""} Strong Core Web Vitals performance.`,
  },
};

async function getSitesByTier(tier: string): Promise<Site[]> {
  const db = getDb();
  if (!db) return [];
  const config = TIERS[tier];
  if (!config) return [];

  try {
    return await db
      .select()
      .from(sites)
      .where(and(eq(sites.isListed, true), gte(sites.currentScore, config.minScore)))
      .orderBy(desc(sites.currentScore));
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  return Object.keys(TIERS).map((tier) => ({ tier }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tier: string }>;
}): Promise<Metadata> {
  const { tier } = await params;
  const config = TIERS[tier];
  if (!config) return {};

  const siteList = await getSitesByTier(tier);
  const title = config.title;
  const description = config.description(siteList.length, siteList[0]);

  return {
    title,
    description,
    alternates: { canonical: `${siteConfig.url}/leaderboard/${tier}` },
    openGraph: { title, description, url: `${siteConfig.url}/leaderboard/${tier}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TierPage({
  params,
}: {
  params: Promise<{ tier: string }>;
}) {
  const { tier } = await params;
  const config = TIERS[tier];
  if (!config) notFound();

  const siteList = await getSitesByTier(tier);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${config.label} Websites by PageSpeed Score`,
    description: config.description(siteList.length, siteList[0]),
    url: `${siteConfig.url}/leaderboard/${tier}`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: siteList.length,
    itemListElement: siteList.slice(0, 10).map((site, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${siteConfig.url}/site/${site.slug}`,
      name: `${site.name} — PageSpeed ${site.currentScore}/100`,
    })),
  };

  return (
    <div className="py-[40px] px-5 pb-[60px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[0.8rem] text-text-muted mb-6">
        <Link href="/" className="text-text-muted no-underline hover:text-accent">
          TheFastestWeb
        </Link>
        <span className="text-border-light">&rsaquo;</span>
        <span className="text-text-primary">{config.label}</span>
      </div>

      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-[900] tracking-[-0.03em] mb-3">
          <span className="bg-gradient-to-br from-accent-bright via-orange to-accent bg-clip-text text-transparent">
            {config.label}
          </span>{" "}
          Websites
        </h1>
        <p className="text-text-secondary text-[0.92rem] max-w-[480px] mx-auto">
          {config.description(siteList.length, siteList[0])}
        </p>
      </div>

      {/* Leaderboard */}
      {siteList.length > 0 ? (
        <LeaderboardTable initialSites={siteList} />
      ) : (
        <div className="text-center text-text-muted py-16 text-[0.9rem]">
          No sites in this tier yet.{" "}
          <Link href="/submit" className="text-accent no-underline hover:underline">
            Submit yours
          </Link>
        </div>
      )}

      {/* Links to other tiers */}
      <div className="mt-10 flex justify-center gap-3 flex-wrap">
        {Object.entries(TIERS)
          .filter(([key]) => key !== tier)
          .map(([key, t]) => (
            <Link
              key={key}
              href={`/leaderboard/${key}`}
              className="px-4 py-2 rounded-[10px] bg-bg-card border border-border text-text-secondary text-[0.82rem] font-semibold no-underline hover:bg-bg-card-hover hover:border-border-light transition-all"
            >
              {t.label} →
            </Link>
          ))}
      </div>
    </div>
  );
}
