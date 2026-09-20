import { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { sites, speedTests, users } from "@/db/schema";
import { auth } from "@/auth";
import { FaviconImg } from "@/components/ui/FaviconImg";
import { Avatar } from "@/components/ui/Avatar";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getPublicFounder } from "@/modules/founders/service";
import { publicSiteProjection, publiclyActive } from "@/modules/sites/directory";
import { pageMetadata } from "@/lib/seo/metadata";
import { resolveFounderUsername } from "@/modules/founders/usernames";
import { getFounderPath } from "@/modules/founders/paths";
import { UsernameEditor } from "@/components/founders/UsernameEditor";

// A privacy change must take effect without a stale cached public profile.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ username: string }>;
}

const readPublicProfile = cache(async (username: string) => {
  const db = getDb();
  if (!db) return null;
  // Reuse the explicit public projection; private account fields never enter the view.
  const profile = await getPublicFounder(username);
  if (!profile) return null;
  const siteIds = profile.sites.map((site) => site.id);
  const userSites = siteIds.length ? await db.select({ ...publicSiteProjection, currentLoadTime: sites.currentLoadTime })
    .from(sites).where(and(publiclyActive(), inArray(sites.id, siteIds)))
    .orderBy(desc(sites.currentScore)).limit(100) : [];
  let twitterHandle: string | null = null;
  const social = profile.socialLinks.find((link) => link.platform === "x" || link.platform === "twitter");
  if (social) {
    try {
      const url = new URL(social.url);
      const handle = url.pathname.replace(/^\//, "").replace(/\/$/, "");
      if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) && /^[A-Za-z0-9_]{1,15}$/.test(handle)) twitterHandle = handle;
    } catch { /* Invalid stored social links are not published. */ }
  }
  return { user: { name: profile.name, avatarUrl: profile.avatarUrl, twitterHandle, isPro: false }, userSites };
});

const readProfile = cache(async (username: string) => {
  if (!z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).safeParse(username).success) return null;
  const session = await auth();
  const identity = await resolveFounderUsername(username, session?.user?.id);
  if (!identity || identity.slug !== username) return null;
  const isOwner = Boolean(identity.userId && session?.user?.id === identity.userId);
  const published = identity.visibility === "public" ? await readPublicProfile(username) : null;
  if (published) return { ...published, isPrivate: false, isOwner, username };

  // "My Profile" also works before publication. This fallback belongs exclusively
  // to the signed-in account and never creates or publishes a founder record.
  const userId = identity.userId;
  if (!isOwner || !userId) return null;
  const db = getDb();
  if (!db) return null;
  const [user] = await db.select({ name: users.name, avatarUrl: users.avatarUrl,
    twitterHandle: users.twitterHandle, isPro: users.isPro }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const userSites = await db.select({ ...publicSiteProjection, currentLoadTime: sites.currentLoadTime })
    .from(sites).where(and(eq(sites.ownerId, userId), publiclyActive()))
    .orderBy(desc(sites.currentScore)).limit(100);
  return { user, userSites, isPrivate: true, isOwner, username };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const data = await readProfile(username);
  if (!data) notFound();
  if (data.isPrivate) return pageMetadata({ title: "My profile", description: "Your private account profile and submitted public websites.",
    path: getFounderPath(username), index: false, follow: false });
  const { user, userSites } = data;
  const siteCount = userSites.length;
  const bestScore = siteCount > 0 ? Math.max(...userSites.map((s) => s.currentScore)) : null;
  const handle = user.twitterHandle ? ` (@${user.twitterHandle.replace("@", "")})` : "";

  const title = `${user.name}${handle} — ${siteCount} public site${siteCount !== 1 ? "s" : ""}`;
  const description = `${user.name} has ${siteCount} public website${siteCount !== 1 ? "s" : ""} on TheFastestWeb.${bestScore !== null ? ` Best recorded score: ${bestScore}/100.` : ""}`;

  return pageMetadata({ title, description, path: getFounderPath(username) });
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const data = await readProfile(username);
  if (!data) notFound();
  const { user, userSites, isPrivate, isOwner } = data;
  const db = getDb();

  // Compute aggregate stats
  const siteCount = userSites.length;
  const avgScore =
    siteCount > 0
      ? Math.round(userSites.reduce((sum, s) => sum + s.currentScore, 0) / siteCount)
      : 0;

  let totalTests = 0;
  if (db && siteCount > 0) {
    const siteIds = userSites.map((s) => s.id);
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(speedTests)
      .where(inArray(speedTests.siteId, siteIds));
    totalTests = result?.count ?? 0;
  }

  const bestSite = userSites[0] ?? null;

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

      {isPrivate && <div className="mb-6 rounded-[10px] border border-border bg-bg-card px-4 py-3 text-sm text-text-secondary">
        <p className="font-semibold text-text-primary">Only you can see this profile.</p>
        <p className="mt-1">Your account details are private. Published websites below remain visible in the directory.</p>
      </div>}

      {isOwner && <UsernameEditor username={username} />}

      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={user.name} src={user.avatarUrl}
          fallbackSrc={user.twitterHandle ? `/api/avatar/${user.twitterHandle.replace("@", "")}` : null}
          size={72} className="border-2 border-border text-xl" />
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
