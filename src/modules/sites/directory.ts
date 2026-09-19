import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { categories, countries, founders, siteCategories, siteTechnologies, sites, technologies } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { activeSitePlacementPredicate } from "@/modules/payments/entitlements";

export const directorySchema = z.object({
  q: z.string().trim().max(100).default(""),
  category: z.string().regex(/^[a-z0-9-]{0,80}$/).default(""),
  technology: z.string().regex(/^[a-z0-9-]{0,80}$/).default(""),
  country: z.string().regex(/^(?:[A-Z]{2})?$/).default(""),
  sort: z.enum(["score", "newest", "lcp", "name"]).default("score"),
  page: z.coerce.number().int().min(1).max(400).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
});
export type DirectoryQuery = z.input<typeof directorySchema>;
export const publicSiteProjection = {
  id: sites.id, slug: sites.slug, name: sites.name, url: sites.url, description: sites.description,
  tagline: sites.tagline, category: sites.category, countryCode: sites.countryCode, faviconUrl: sites.faviconUrl,
  currentScore: sites.currentScore, currentLcp: sites.currentLcp, currentTbt: sites.currentTbt,
  currentCls: sites.currentCls, lastTestedAt: sites.lastTestedAt, createdAt: sites.createdAt, lifecycle: sites.lifecycle,
};
export const publiclyActive = () => and(eq(sites.isListed, true), isNull(sites.archivedAt), inArray(sites.lifecycle, ["active", "verified"]));
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "The directory is temporarily unavailable.", 503); return db; }

// LCP is stored as a display string ("763ms", "1.1s", "13.5 s"); order by its value in milliseconds.
const lcpMilliseconds = sql`CASE WHEN ${sites.currentLcp} ~ '^[0-9]+([.][0-9]+)?[[:space:]]*ms$' THEN regexp_replace(${sites.currentLcp}, '[[:space:]]*ms$', '')::numeric WHEN ${sites.currentLcp} ~ '^[0-9]+([.][0-9]+)?[[:space:]]*s$' THEN regexp_replace(${sites.currentLcp}, '[[:space:]]*s$', '')::numeric * 1000 ELSE NULL END`;

export async function listDirectory(raw: DirectoryQuery = {}) {
  const query = directorySchema.parse(raw), db = database();
  const escaped = query.q.replace(/[\\%_]/g, "\\$&");
  const conditions = [publiclyActive(), query.q ? or(ilike(sites.name, `%${escaped}%`), ilike(sites.description, `%${escaped}%`)) : undefined,
    query.minScore !== undefined ? gte(sites.currentScore, query.minScore) : undefined,
    query.country ? eq(sites.countryCode, query.country) : undefined,
    query.category ? sql`EXISTS (SELECT 1 FROM site_categories sc JOIN categories c ON c.id=sc.category_id WHERE sc.site_id=${sites.id} AND c.slug=${query.category} AND c.active)` : undefined,
    query.technology ? sql`EXISTS (SELECT 1 FROM site_technologies st JOIN technologies t ON t.id=st.technology_id WHERE st.site_id=${sites.id} AND t.slug=${query.technology} AND t.active)` : undefined];
  const where = and(...conditions);
  const [rows, [count]] = await Promise.all([
    db.select(publicSiteProjection).from(sites).where(where)
      .orderBy(...(query.sort === "newest" ? [desc(sites.createdAt), asc(sites.id)] : query.sort === "name" ? [asc(sql`lower(${sites.name})`), asc(sites.id)] : query.sort === "lcp" ? [sql`${lcpMilliseconds} ASC NULLS LAST`, desc(sites.currentScore), asc(sites.id)] : [desc(sites.currentScore), asc(sites.id)]))
      .limit(query.limit).offset((query.page - 1) * query.limit),
    db.select({ total: sql<number>`count(*)::int` }).from(sites).where(where),
  ]);
  return { sites: rows, total: count.total, page: query.page, pages: Math.ceil(count.total / query.limit), query };
}
export type DirectorySite = Awaited<ReturnType<typeof listDirectory>>["sites"][number];

export async function listSponsoredPlacements(page = 1, limit = 24) {
  const db = database();
  const safePage = z.number().int().min(1).max(400).parse(page);
  const safeLimit = z.number().int().min(1).max(24).parse(limit);
  const where = and(publiclyActive(), or(
    activeSitePlacementPredicate("FEATURED", sql`${sites.id}`, sql`${sites.ownerId}`),
    activeSitePlacementPredicate("SPONSORSHIP", sql`${sites.id}`, sql`${sites.ownerId}`),
  ));
  const [items, [count]] = await Promise.all([
    db.select(publicSiteProjection).from(sites).where(where)
      // Rotate paid homepage exposure hourly; measured rankings remain unchanged.
      .orderBy(sql`md5(${sites.id}::text || to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD-HH24'))`, asc(sites.id))
      .limit(safeLimit).offset((safePage - 1) * safeLimit),
    db.select({ total: sql<number>`count(*)::int` }).from(sites).where(where),
  ]);
  return { items, total: count.total, page: safePage, pages: Math.ceil(count.total / safeLimit) };
}

export async function getDiscovery() {
  const db = database();
  const [categoryRows, technologyRows, countryRows] = await Promise.all([
    db.select({ slug: categories.slug, name: categories.name, count: sql<number>`count(distinct ${sites.id})::int` })
      .from(categories).innerJoin(siteCategories, eq(siteCategories.categoryId, categories.id)).innerJoin(sites, eq(sites.id, siteCategories.siteId))
      .where(and(publiclyActive(), eq(categories.active, true))).groupBy(categories.id).orderBy(asc(categories.name)),
    db.select({ slug: technologies.slug, name: technologies.name, count: sql<number>`count(distinct ${sites.id})::int` })
      .from(technologies).innerJoin(siteTechnologies, eq(siteTechnologies.technologyId, technologies.id)).innerJoin(sites, eq(sites.id, siteTechnologies.siteId))
      .where(and(publiclyActive(), eq(technologies.active, true))).groupBy(technologies.id).orderBy(asc(technologies.name)),
    db.select({ code: countries.code, name: countries.name, count: sql<number>`count(*)::int` })
      .from(countries).innerJoin(sites, eq(sites.countryCode, countries.code)).where(publiclyActive()).groupBy(countries.code).orderBy(asc(countries.name)),
  ]);
  return { categories: categoryRows, technologies: technologyRows, countries: countryRows };
}

export async function listFounders(page = 1) {
  const db = database(), offset = (Math.max(1, Math.min(page, 400)) - 1) * 24;
  const [rows, [count]] = await Promise.all([
    db.select({ slug: founders.slug, name: founders.name, bio: founders.bio, avatarUrl: founders.avatarUrl, countryCode: founders.countryCode })
      .from(founders).where(eq(founders.visibility, "public")).orderBy(asc(founders.name), asc(founders.id)).limit(24).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(founders).where(eq(founders.visibility, "public")),
  ]);
  return { founders: rows, total: count.total, pages: Math.ceil(count.total / 24) };
}
