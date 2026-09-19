import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/index";
import { sites, Site, categoryEnum } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

type CategoryValue = typeof categoryEnum.enumValues[number];

export const revalidate = 3600;

const CATEGORIES: Record<string, { label: string; plural: string; description: string }> = {
  saas:      { label: "SaaS",      plural: "SaaS websites",   description: "SaaS products and web applications" },
  tool:      { label: "Tool",      plural: "tools",           description: "developer tools, productivity tools, and utilities" },
  directory: { label: "Directory", plural: "directories",     description: "directories, databases, and listing sites" },
  portfolio: { label: "Portfolio", plural: "portfolios",      description: "portfolio and personal websites" },
  blog:      { label: "Blog",      plural: "blogs",           description: "blogs and content sites" },
  other:     { label: "Other",     plural: "websites",        description: "websites across various categories" },
};

async function getSitesByCategory(category: CategoryValue): Promise<Site[]> {
  const db = getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(sites)
      .where(and(eq(sites.isListed, true), eq(sites.category, category)))
      .orderBy(desc(sites.currentScore));
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  return Object.keys(CATEGORIES).map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const meta = CATEGORIES[category];
  if (!meta) return {};

  const siteList = await getSitesByCategory(category as CategoryValue);
  const top = siteList[0];

  const title = `Fastest ${meta.label} Websites — PageSpeed Rankings | TheFastestWeb`;
  const description = `The fastest ${meta.plural} ranked by Google PageSpeed score, tested daily. ${
    top ? `Top scorer: ${top.name} at ${top.currentScore}/100. ` : ""
  }${siteList.length} ${meta.plural} tracked and updated every 24 hours.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://thefastestweb.site/fastest/${category}`,
    },
    openGraph: {
      title,
      description,
      url: `https://thefastestweb.site/fastest/${category}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const meta = CATEGORIES[category];
  if (!meta) notFound();

  const siteList = await getSitesByCategory(category as CategoryValue);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Fastest ${meta.label} Websites by PageSpeed Score`,
    description: `The fastest ${meta.plural} ranked by Google PageSpeed score, tested daily. ${siteList.length} ${meta.plural} tracked.`,
    url: `https://thefastestweb.site/fastest/${category}`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: siteList.length,
    itemListElement: siteList.slice(0, 10).map((site, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://thefastestweb.site/site/${site.slug}`,
      name: `${site.name} — PageSpeed ${site.currentScore}/100`,
    })),
  };

  return (
    <div className="py-[40px] px-5 pb-[60px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[0.8rem] text-text-muted mb-6">
        <Link href="/" className="text-text-muted no-underline hover:text-accent">
          TheFastestWeb
        </Link>
        <span className="text-border-light">&rsaquo;</span>
        <span className="text-text-primary">Fastest {meta.label} Websites</span>
      </div>

      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-[900] tracking-[-0.03em] mb-3">
          Fastest{" "}
          <span className="bg-gradient-to-br from-accent-bright via-orange to-accent bg-clip-text text-transparent">
            {meta.label}
          </span>{" "}
          Websites
        </h1>
        <p className="text-text-secondary text-[0.92rem] max-w-[480px] mx-auto">
          {siteList.length} {meta.plural} ranked by Google PageSpeed score.
          Tested and updated every 24 hours.
        </p>
      </div>

      {/* Leaderboard */}
      {siteList.length > 0 ? (
        <LeaderboardTable initialSites={siteList} />
      ) : (
        <div className="text-center text-text-muted py-16 text-[0.9rem]">
          No {meta.plural} listed yet.{" "}
          <Link href="/submit" className="text-accent no-underline hover:underline">
            Submit yours
          </Link>
        </div>
      )}

      {/* CTA */}
      <div className="mt-10 text-center">
        <p className="text-text-muted text-[0.82rem] mb-3">
          Have a {meta.label.toLowerCase()} you want tracked?
        </p>
        <Link
          href="/submit"
          className="inline-flex items-center gap-2 px-5 py-[10px] rounded-[10px] text-[0.88rem] font-semibold bg-gradient-to-br from-accent to-accent-bright text-bg-deep no-underline transition-all duration-200 hover:-translate-y-0.5"
        >
          Submit Your Site
        </Link>
      </div>
    </div>
  );
}
