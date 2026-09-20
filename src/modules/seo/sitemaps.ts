import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { siteConfig } from "@/config/site";
import { getAllPosts } from "@/lib/blog";
import { AppError } from "@/lib/http/errors";
import { publiclyActive } from "@/modules/sites/directory";
import { getCategoryCounts } from "@/modules/catalog/public-categories";
import { categoryPath } from "@/modules/catalog/categories";

export const sitemapSections = ["pages", "sites", "blog", "categories"] as const;
export type SitemapSection = typeof sitemapSections[number];
const pageSize = 5000;
type Entry = { path: string; modified?: Date | null };
export const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const staticPaths = ["/", "/test", "/submit", "/pricing", "/advertise", "/about", "/blog", "/privacy", "/terms", "/categories",
  ...["perfect", "90-plus", "80-plus"].map((tier) => `/leaderboard/${tier}`)];
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Sitemaps are temporarily unavailable.", 503); return db; }
function urls(entries: Entry[]) {
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries.map((entry) => `<url><loc>${xmlEscape(siteConfig.url + entry.path)}</loc>${entry.modified && Number.isFinite(entry.modified.getTime()) ? `<lastmod>${entry.modified.toISOString()}</lastmod>` : ""}</url>`).join("") + "</urlset>";
}
export async function sitemapIndex() {
  let paths: string[] = [];
  if (!siteConfig.isDemo) {
    const db = database();
    const [siteCount] = await db.select({ count: sql<number>`count(*)::int` }).from(sites).where(publiclyActive());
    const categoryCounts = await getCategoryCounts();
    if (!categoryCounts.available) throw new AppError("DATABASE_UNAVAILABLE", "Sitemaps are temporarily unavailable.", 503);
    const counts: Record<SitemapSection, number> = {
      pages: staticPaths.length, sites: siteCount.count, blog: getAllPosts().length,
      categories: categoryCounts.categories.filter((category) => category.count > 0).length,
    };
    paths = sitemapSections.flatMap((section) => Array.from({ length: Math.ceil(counts[section] / pageSize) }, (_, page) => `/sitemaps/${section}/${page}.xml`));
  }
  return '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + paths.map((path) => `<sitemap><loc>${xmlEscape(siteConfig.url + path)}</loc></sitemap>`).join("") + "</sitemapindex>";
}
export async function sitemapDocument(section: SitemapSection, page: number) {
  if (!sitemapSections.includes(section) || !Number.isInteger(page) || page < 0 || page > 10000) throw new AppError("NOT_FOUND", "Sitemap not found.", 404);
  if (siteConfig.isDemo) return urls([]);
  if (section === "pages") return urls(page === 0 ? staticPaths.map((path) => ({ path })) : []);
  if (section === "blog") return urls(getAllPosts().slice(page * pageSize, (page + 1) * pageSize).map((post) => ({ path: `/blog/${encodeURIComponent(post.slug)}`, modified: new Date(post.updated || post.date) })));
  if (section === "categories") {
    const catalog = await getCategoryCounts();
    if (!catalog.available) throw new AppError("DATABASE_UNAVAILABLE", "Sitemaps are temporarily unavailable.", 503);
    return urls(catalog.categories.filter((category) => category.count > 0).slice(page * pageSize, (page + 1) * pageSize).map((category) => ({ path: categoryPath(category.slug) })));
  }
  const db = database();
  return urls((await db.select({ slug: sites.slug, modified: sites.lastTestedAt, created: sites.createdAt }).from(sites).where(publiclyActive()).orderBy(asc(sites.id)).limit(pageSize).offset(page * pageSize)).map((row) => ({ path: `/site/${encodeURIComponent(row.slug)}`, modified: row.modified || row.created })));
}

/** Canonical search documents never include account or draft routes. */
export async function publicCorpusSummary() {
  const db = database();
  const rows = await db.select({ name: sites.name, slug: sites.slug, description: sites.description }).from(sites)
    .where(and(eq(sites.isListed, true), isNull(sites.archivedAt), inArray(sites.lifecycle, ["active", "verified"]))).orderBy(asc(sites.name)).limit(50);
  return rows.map((row) => `- ${row.name.replace(/[\r\n]/g, " ")}: ${siteConfig.url}/site/${encodeURIComponent(row.slug)} — ${row.description.replace(/[\r\n]/g, " ")}`);
}
