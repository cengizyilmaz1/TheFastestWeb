import { siteConfig } from "@/config/site";
import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getDb } from "@/db/index";
import { users, sites, speedTests } from "@/db/schema";
import { FaviconImg } from "@/components/ui/FaviconImg";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

export const revalidate = 300;

interface Props {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const db = getDb();
  if (!db) return { title: "Profile | TheFastestWeb" };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { title: "Profile | TheFastestWeb" };

  const userSites = await db
    .select({ score: sites.currentScore, name: sites.name })
    .from(sites)
    .where(and(eq(sites.ownerId, userId), eq(sites.isListed, true)));

  const siteCount = userSites.length;
  const bestScore = siteCount > 0 ? Math.max(...userSites.map((s) => s.score)) : null;
  const handle = user.twitterHandle ? ` (@${user.twitterHandle.replace("@", "")})` : "";

  const title = `${user.name}${handle} — ${siteCount} site${siteCount !== 1 ? "s" : ""} on TheFastestWeb`;
  const description = `${user.name} builds ${siteCount} website${siteCount !== 1 ? "s" : ""} tracked on TheFastestWeb.${bestScore !== null ? ` Best PageSpeed score: ${bestScore}/100.` : ""} ${userSites.map((s) => s.name).slice(0, 3).join(", ")}${siteCount > 3 ? " and more" : ""} — all tested daily.`;

  return {
    title,
    description,
    alternates: { canonical: `${siteConfig.url}/profile/${userId}` },
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;
  const db = getDb();
  if (!db) notFound();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) notFound();

  const userSites = await db
    .select()
    .from(sites)
    .where(and(eq(sites.ownerId, userId), eq(sites.isListed, true)))
    .orderBy(desc(sites.currentScore));

  // Compute aggregate stats
  const siteCount = userSites.length;
  const avgScore =
    siteCount > 0
      ? Math.round(userSites.reduce((sum, s) => sum + s.currentScore, 0) / siteCount)
      : 0;

  let totalTests = 0;
  if (siteCount > 0) {
    const siteIds = userSites.map((s) => s.id);
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(speedTests)
      .where(inArray(speedTests.siteId, siteIds));
    totalTests = result?.count ?? 0;
  }

  const bestSite = userSites[0] ?? null;
  const avatarUrl = user.twitterHandle ? `/api/avatar/${user.twitterHandle.replace("@", "")}` : user.avatarUrl;

  return (
    <div className="py-[30px] px-5 pb-[50px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[0.8rem] text-text-muted mb-6">
        <Link href="/" className="text-text-muted no-underline hover:text-accent">
          TheFastestWeb
        </Link>
        <span className="text-border-light">&rsaquo;</span>
        <span className="text-text-primary">{user.name}</span>
      </div>

      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        {avatarUrl ? (
          <Image
            unoptimized
            width={72}
            height={72}
            src={avatarUrl}
            alt={user.name}
            className="w-[72px] h-[72px] rounded-full border-2 border-border object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-[72px] h-[72px] rounded-full border-2 border-border flex items-center justify-center font-bold text-text-muted" aria-label={user.name}>
            {user.name.trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display font-[800] text-[1.6rem] tracking-[-0.02em]">
              {user.name}
            </h1>
            {user.isPro && (
              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-accent to-accent-bright text-bg-deep text-[0.65rem] font-bold tracking-wide uppercase">
                Pro
              </span>
            )}
          </div>
          {user.twitterHandle && (
            <a
              href={`https://x.com/${user.twitterHandle.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent text-[0.82rem] no-underline hover:underline"
            >
              @{user.twitterHandle.replace("@", "")}
            </a>
          )}
          {!user.twitterHandle && (
            <p className="text-text-muted text-[0.82rem]">
              {siteCount} site{siteCount !== 1 ? "s" : ""} on TheFastestWeb
            </p>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3 mb-8 max-[640px]:grid-cols-2">
        <div className="bg-bg-card border border-border rounded-[10px] p-4">
          <div className="text-[0.72rem] font-semibold text-text-muted mb-1">
            Sites
          </div>
          <div className="font-mono font-[800] text-[1.5rem] text-text-primary">
            {siteCount}
          </div>
          <div className="text-[0.72rem] text-text-muted mt-0.5">Submitted</div>
        </div>
        <div className="bg-bg-card border border-border rounded-[10px] p-4">
          <div className="text-[0.72rem] font-semibold text-text-muted mb-1">
            Avg. Score
          </div>
          <div className={`font-mono font-[800] text-[1.5rem] ${avgScore >= 90 ? "text-green" : avgScore >= 70 ? "text-accent-bright" : "text-orange"}`}>
            {avgScore}
          </div>
          <div className="text-[0.72rem] text-text-muted mt-0.5">Across all sites</div>
        </div>
        <div className="bg-bg-card border border-border rounded-[10px] p-4">
          <div className="text-[0.72rem] font-semibold text-text-muted mb-1">
            Best Score
          </div>
          <div className="font-mono font-[800] text-[1.5rem] text-green">
            {bestSite?.currentScore ?? "—"}
          </div>
          <div className="text-[0.72rem] text-text-muted mt-0.5 truncate">
            {bestSite?.name ?? "—"}
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-[10px] p-4">
          <div className="text-[0.72rem] font-semibold text-text-muted mb-1">
            Speed Tests
          </div>
          <div className="font-mono font-[800] text-[1.5rem] text-text-primary">
            {totalTests}
          </div>
          <div className="text-[0.72rem] text-text-muted mt-0.5">Total runs</div>
        </div>
      </div>

      {/* Sites list */}
      <h2 className="font-display font-bold text-[1.05rem] text-text-secondary mb-4">
        Sites by {user.name}
      </h2>

      {userSites.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-[12px] p-8 text-center">
          <p className="text-text-muted text-[0.85rem]">No sites submitted yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 max-[480px]:grid-cols-1" style={{ gridTemplateColumns: userSites.length === 1 ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {userSites.map((site) => {
            const scoreClass =
              site.currentScore >= 90
                ? "text-green"
                : site.currentScore >= 70
                  ? "text-accent-bright"
                  : "text-orange";

            return (
              <Link
                key={site.id}
                href={`/site/${site.slug}`}
                className="bg-bg-card border border-border rounded-[12px] p-4 no-underline text-inherit transition-all duration-200 hover:bg-bg-card-hover hover:border-border-light hover:-translate-y-0.5 block"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-[10px] bg-bg-elevated overflow-hidden flex items-center justify-center shrink-0">
                    <FaviconImg
                      url={site.url}
                      src={site.faviconUrl || undefined}
                      alt={site.name}
                      className="w-full h-full object-contain p-1.5"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[0.9rem] text-text-primary">
                      {site.name}
                    </div>
                    <div className="text-[0.72rem] text-text-muted font-mono truncate">
                      {new URL(site.url).hostname}
                    </div>
                  </div>
                </div>
                <p className="text-[0.78rem] text-text-muted mb-3 line-clamp-2 leading-relaxed">
                  {site.description || "No description"}
                </p>
                <div className="flex items-center justify-between border-t border-border pt-2.5">
                  <div>
                    <span className="text-[0.68rem] text-text-muted">Speed Score</span>
                    <div className={`font-mono font-bold text-[1.1rem] ${scoreClass}`}>
                      {site.currentScore}/100
                    </div>
                  </div>
                  {site.currentLoadTime && (
                    <div className="text-right">
                      <span className="text-[0.68rem] text-text-muted">Load Time</span>
                      <div className="font-mono font-semibold text-[0.9rem] text-text-secondary">
                        {site.currentLoadTime}
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
