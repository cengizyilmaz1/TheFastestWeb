import { asc, desc, sql } from "drizzle-orm";
import { sites } from "@/db/schema";
import { publicSiteProjection } from "./directory";

/** The original leaderboard's view model, without private site/account columns. */
export const legacyLeaderboardProjection = {
  ...publicSiteProjection,
  currentLoadTime: sites.currentLoadTime,
  trend: sites.trend,
  ownerId: sql<string | null>`(select f.user_id from founders f where f.user_id = ${sites.ownerId} and f.visibility = 'public' limit 1)`,
  ownerName: sql<string>`coalesce((select f.name from founders f where f.user_id = ${sites.ownerId} and f.visibility = 'public' limit 1), '')`,
  ownerAvatarUrl: sql<string | null>`(select f.avatar_url from founders f where f.user_id = ${sites.ownerId} and f.visibility = 'public' limit 1)`,
  ownerUsername: sql<string | null>`(select f.slug from founders f where f.user_id = ${sites.ownerId} and f.visibility = 'public' limit 1)`,
  twitterHandle: sql<string | null>`null::text`,
};

// Initial server rows and subsequent pages must have the same stable ordering.
const loadMilliseconds = sql`CASE
  WHEN ${sites.currentLoadTime} ~* '^[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*ms[[:space:]]*$' THEN regexp_replace(${sites.currentLoadTime}, '[^0-9.]', '', 'g')::numeric
  WHEN ${sites.currentLoadTime} ~* '^[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*s[[:space:]]*$' THEN regexp_replace(${sites.currentLoadTime}, '[^0-9.]', '', 'g')::numeric * 1000
  ELSE NULL END`;
export const legacyLeaderboardOrder = (sort: "score" | "loadtime" = "score") => sort === "loadtime"
  ? [asc(loadMilliseconds), desc(sites.currentScore), asc(sites.createdAt), asc(sites.id)]
  : [desc(sites.currentScore), asc(loadMilliseconds), asc(sites.createdAt), asc(sites.id)];

export type LegacyLeaderboardSite = {
  id: string; slug: string; url: string; name: string; description: string;
  category: string | null; faviconUrl: string | null;
  currentScore: number; currentLoadTime?: string | null; trend?: number | null;
  lastTestedAt?: Date | string | null;
  ownerId?: string | null; ownerName?: string; ownerAvatarUrl?: string | null; ownerUsername?: string | null; twitterHandle?: string | null;
};
