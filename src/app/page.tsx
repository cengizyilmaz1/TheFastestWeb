import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { AdSuccessBanner } from "@/components/ads/AdSuccessBanner";
import { sites } from "@/db/schema";
import { publiclyActive } from "@/modules/sites/directory";
import { legacyLeaderboardOrder, legacyLeaderboardProjection, type LegacyLeaderboardSite } from "@/modules/sites/legacy-view";
import { getDb } from "@/db/index";
import { desc, sql } from "drizzle-orm";
import { siteUrl, SITE_DESCRIPTION } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/structured-data";
import { safeJsonLd } from "@/lib/seo/json-ld";

const homepageMetadata = pageMetadata({
  "title": "Website speed rankings",
  "description": "Compare recorded website speed scores and inspect public performance reports. Discover fast websites and test your own with TheFastestWeb.",
  "path": "/"
});

// The public homepage's external badge links remain followed, including in previews.
// Preserve demo noindex and every other existing metadata directive.
export const metadata = {
  ...homepageMetadata,
  robots: { ...(typeof homepageMetadata.robots === "object" ? homepageMetadata.robots : {}), follow: true },
};

export const revalidate = 300;

const getSites = unstable_cache(
  async (): Promise<LegacyLeaderboardSite[]> => {
    const db = getDb();
    if (!db) return [];

    const result = await db
      .select(legacyLeaderboardProjection)
      .from(sites)
      .where(publiclyActive())
      .orderBy(...legacyLeaderboardOrder())
      .limit(50);

    // Throw on empty so unstable_cache doesn't store the failure —
    // next request will retry the DB instead of serving cached [].
    if (result.length === 0) throw new Error("getSites: empty result");
    return result;
  },
  ["original-public-leaderboard-sites"],
  { revalidate: 300 }
);

const getStats = unstable_cache(
  async (): Promise<{ total: number; avgTop10: number }> => {
    const db = getDb();
    if (db) {
      try {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(sites)
          .where(publiclyActive());

        const top10 = await db
          .select({ score: sites.currentScore })
          .from(sites)
          .where(publiclyActive())
          .orderBy(desc(sites.currentScore))
          .limit(10);

        const avg = top10.length > 0
          ? top10.reduce((sum, r) => sum + r.score, 0) / top10.length
          : 0;

        return { total: count, avgTop10: Math.round(avg * 10) / 10 };
      } catch {
        // fallback below
      }
    }
    return { total: 0, avgTop10: 0 };
  },
  ["leaderboard-stats"],
  { revalidate: 300 }
);

async function LeaderboardSection() {
  let siteList: LegacyLeaderboardSite[] = [];
  try {
    siteList = await getSites();
  } catch {
    // DB error — render empty table, client will load via /api/sites
  }
  const jsonLd = { ...webPageSchema({ path: "/", name: "Website speed rankings", description: SITE_DESCRIPTION, type: "CollectionPage" }),
    mainEntity: { "@type": "ItemList", itemListOrder: "https://schema.org/ItemListOrderDescending", numberOfItems: siteList.length,
      itemListElement: siteList.map((site, index) => ({ "@type": "ListItem", position: index + 1, name: site.name, url: siteUrl(`/site/${encodeURIComponent(site.slug)}`) })) } };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} /><LeaderboardTable initialSites={siteList} /></>;
}

export default async function HomePage() {
  const stats = await getStats();

  return (
    <>
      <Suspense fallback={null}>
        <AdSuccessBanner />
      </Suspense>

      {/* Hero */}
      <section className="pt-8 pb-1 px-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[radial-gradient(ellipse,rgba(245,158,11,0.08)_0%,transparent_70%)] pointer-events-none" />
        <div className="mb-4 flex justify-center">
          <span data-indietools-domain-rating-badge="true" className="inline-flex h-9 w-[249px] max-w-full justify-center">
            <a href="https://www.indietools.app/products/thefastestweb?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=domain-rating" target="_blank" rel="noopener" className="inline-flex h-9 items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {/* Match the previous badge's 36px height without stretching the dynamic SVG. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://www.indietools.app/badges/domain-rating/cmlo98m660000jv044qva1dx3.svg?theme=light&amp;font=modern" alt="View the current Domain Rating for TheFastestWeb on IndieTools" width="120" height="36" className="h-9 w-[120px]" />
            </a>
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent-glow border border-[rgba(245,158,11,0.2)] text-[0.72rem] font-semibold text-accent-bright mb-5 font-mono tracking-[0.03em] animate-fade-in-up">
          FREE DAILY SPEED MONITORING
        </div>
        <h1 className="font-display text-[clamp(2rem,4vw,3.2rem)] font-[900] leading-[1.1] tracking-[-0.03em] mb-3.5 animate-fade-in-up-1">
          <span className="bg-gradient-to-br from-accent-bright via-orange to-accent bg-clip-text text-transparent">
            How Fast Is
          </span>
          <br />
          Your Website?
        </h1>
        <p className="text-base text-text-secondary max-w-[500px] mx-auto mb-6 animate-fade-in-up-2">
          Submit your site and we&apos;ll track your speed score every day, for free. See how you rank against other websites and prove you&apos;re fast.
        </p>
        <div className="flex gap-3 justify-center animate-fade-in-up-3 max-[640px]:flex-col max-[640px]:items-center">
          <Link
            href="/submit"
            className="inline-flex items-center gap-2 px-5 py-[11px] rounded-[10px] text-[0.9rem] font-semibold bg-gradient-to-br from-accent to-accent-bright text-bg-deep no-underline shadow-[0_0_30px_var(--color-accent-glow),0_4px_12px_rgba(0,0,0,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(245,158,11,0.3),0_6px_20px_rgba(0,0,0,0.3)]"
          >
            Submit Your Site
          </Link>
          <Link
            href="/test"
            className="inline-flex items-center gap-2 px-5 py-[11px] rounded-[10px] text-[0.9rem] font-semibold bg-bg-card text-text-primary border border-border no-underline transition-all duration-200 hover:bg-bg-card-hover hover:border-border-light"
          >
            Test Your Speed
          </Link>
        </div>

        {/* Trusted by */}
        <div className="flex items-center justify-center gap-2.5 mt-5 animate-fade-in-up-3">
          <div className="flex items-center -space-x-2">
            {[
              { handle: "jakobjelling", ext: "png" },
              { handle: "anthovdo", ext: "jpg" },
              { handle: "bhargavk_", ext: "jpg" },
              { handle: "vladbuilds", ext: "jpg" },
              { handle: "0hr_maker", ext: "jpg" },
              { handle: "KerjaRemote_", ext: "jpg" },
            ].map(({ handle, ext }) => (
              <a
                key={handle}
                href={`https://x.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`@${handle}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/avatars/${handle}.${ext}`}
                  alt={handle}
                  className="w-7 h-7 rounded-full border-2 border-bg-deep object-cover hover:scale-110 transition-transform"
                />
              </a>
            ))}
          </div>
          <span className="text-[0.78rem] text-text-muted">Trusted by indie founders</span>
        </div>
      </section>

      {/* Pulse Bar */}
      <div className="flex justify-center gap-8 pt-2 pb-3 px-4 mb-2 animate-fade-in-up-4 max-[640px]:flex-col max-[640px]:items-center max-[640px]:gap-2">
        <div className="flex items-center gap-1.5 text-[0.8rem] text-text-muted">
          <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse-dot" />
          <strong className="text-text-secondary font-mono font-semibold">
            {stats.total.toLocaleString()}
          </strong>
          &nbsp;websites indexed
        </div>
        <div className="flex items-center gap-1.5 text-[0.8rem] text-text-muted">
          <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse-dot" />
          <strong className="text-text-secondary font-mono font-semibold">
            {stats.avgTop10}
          </strong>
          &nbsp;avg top-10 score
        </div>
      </div>

      {/* Leaderboard */}
      <Suspense fallback={null}>
        <LeaderboardSection />
      </Suspense>

    </>
  );
}
