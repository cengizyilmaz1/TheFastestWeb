import { siteConfig } from "@/config/site";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { Metadata } from "next";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { AdSuccessBanner } from "@/components/ads/AdSuccessBanner";
import { Site, sites } from "@/db/schema";
import { getDb } from "@/db/index";
import { desc, eq, sql } from "drizzle-orm";

export const metadata: Metadata = {
  title: "TheFastestWeb: Speed Rankings for the Web",
  description:
    "Discover, benchmark, and showcase the world's fastest websites. Submit yours and prove you belong on the leaderboard.",
  alternates: {
    canonical: siteConfig.url,
  },
};

export const revalidate = 300;

const getSites = unstable_cache(
  async (): Promise<Site[]> => {
    const db = getDb();
    if (!db) return [];

    const result = await db
      .select()
      .from(sites)
      .where(eq(sites.isListed, true))
      .orderBy(desc(sites.currentScore))
      .limit(50);

    // Throw on empty so unstable_cache doesn't store the failure —
    // next request will retry the DB instead of serving cached [].
    if (result.length === 0) throw new Error("getSites: empty result");
    return result;
  },
  ["leaderboard-sites"],
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
          .where(eq(sites.isListed, true));

        const top10 = await db
          .select({ score: sites.currentScore })
          .from(sites)
          .where(eq(sites.isListed, true))
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
  let siteList: Site[] = [];
  try {
    siteList = await getSites();
  } catch {
    // DB error — render empty table, client will load via /api/sites
  }
  return <LeaderboardTable initialSites={siteList} />;
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
        <div className="mb-4 animate-fade-in-up flex justify-center">
          <a href="https://frogdr.com/thefastestweb.site?utm_source=thefastestweb.site" target="_blank" rel="noopener noreferrer">
            <Image unoptimized src="https://frogdr.com/thefastestweb.site/badge-white-sm.svg?round=1" alt="Monitor your Domain Rating with FrogDR" width={249} height={36} />
          </a>
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
                <Image
                  width={28}
                  height={28}
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
