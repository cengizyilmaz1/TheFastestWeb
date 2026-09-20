import { cache } from "react";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, sites } from "@/db/schema";
import { logger } from "@/infrastructure/logging/logger";
import { publiclyActive } from "@/modules/sites/directory";
import { legacyLeaderboardProjection } from "@/modules/sites/legacy-view";
import { categoryCatalog, type CategorySlug } from "./categories";

export const categoryPageSize = 24;
export type CategorySearch = Record<string, string | string[] | undefined>;
export function categoryPageNumber(search: CategorySearch): number | null {
  if (search.page === undefined) return 1;
  if (typeof search.page !== "string" || !/^[1-9][0-9]{0,3}$/.test(search.page)) return null;
  const page = Number(search.page);
  return page <= 400 ? page : null;
}
export function hasCategoryFilters(search: CategorySearch) {
  return Object.keys(search).some((key) => key !== "page");
}

// Historic rows without a normalized primary category keep their original
// placement. A newly categorized AI website must never leak into "Other".
function categoryPredicate(slug: string | typeof categories.slug) {
  return sql`(EXISTS (SELECT 1 FROM site_categories sc JOIN categories c ON c.id=sc.category_id
    WHERE sc.site_id=${sites.id} AND c.slug=${slug} AND c.active)
    OR (${sites.category}::text=${slug} AND NOT EXISTS
      (SELECT 1 FROM site_categories primary_sc JOIN categories primary_c ON primary_c.id=primary_sc.category_id
       WHERE primary_sc.site_id=${sites.id} AND primary_sc.is_primary AND primary_c.active)))`;
}

export const getCategoryCounts = cache(async () => {
  const db = getDb();
  if (!db) return { available: false, categories: categoryCatalog.map((entry) => ({ ...entry, count: 0 })) };
  try {
    const rows = await db.select({ slug: categories.slug, count: sql<number>`count(${sites.id})::int` }).from(categories)
      .leftJoin(sites, and(publiclyActive(), categoryPredicate(categories.slug)))
      .where(eq(categories.active, true)).groupBy(categories.id);
    const counts = new Map(rows.map((row) => [row.slug, row.count]));
    return { available: true, categories: categoryCatalog.map((entry) => ({ ...entry, count: counts.get(entry.slug) ?? 0 })) };
  } catch {
    logger.error({ event: "category.count_failed", code: "DATABASE_UNAVAILABLE" });
    return { available: false, categories: categoryCatalog.map((entry) => ({ ...entry, count: 0 })) };
  }
});

export const getCategoryListing = cache(async (slug: CategorySlug, page = 1) => {
  const db = getDb();
  if (!db) return { available: false, sites: [], total: 0, pages: 0 };
  try {
    const where = and(publiclyActive(), categoryPredicate(slug));
    const [rows, [count]] = await Promise.all([
      db.select(legacyLeaderboardProjection).from(sites).where(where)
        .orderBy(desc(sites.currentScore), asc(sites.id)).limit(categoryPageSize).offset((page - 1) * categoryPageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(sites).where(where),
    ]);
    return { available: true, sites: rows, total: count.total, pages: Math.ceil(count.total / categoryPageSize) };
  } catch {
    logger.error({ event: "category.list_failed", code: "DATABASE_UNAVAILABLE" });
    return { available: false, sites: [], total: 0, pages: 0 };
  }
});
