import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { competitionPeriods, founders, sites } from "@/db/schema";
import { siteConfig } from "@/config/site";
import { getAllPosts } from "@/lib/blog";
import { AppError } from "@/lib/http/errors";
import { getDiscovery, publiclyActive } from "@/modules/sites/directory";

export const sitemapSections = ["pages", "sites", "founders", "categories", "technologies", "countries", "weekly", "monthly", "blog"] as const;
export type SitemapSection = typeof sitemapSections[number];
const pageSize = 5000;
type Entry = { path: string; modified?: Date | null };
export const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const staticPaths = ["/", "/explore", "/leaderboard", "/founders", "/hall-of-fame", "/test", "/submit", "/pricing", "/about", "/methodology", "/blog", "/privacy", "/terms"];
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Sitemaps are temporarily unavailable.", 503); return db; }
function urls(entries: Entry[]) {
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries.map((entry) => `<url><loc>${xmlEscape(siteConfig.url + entry.path)}</loc>${entry.modified && Number.isFinite(entry.modified.getTime()) ? `<lastmod>${entry.modified.toISOString()}</lastmod>` : ""}</url>`).join("") + "</urlset>";
}
export async function sitemapIndex() {
  let paths: string[] = [];
  if (!siteConfig.isDemo) {
    const db = database();
    const [[siteCount], [founderCount], periods, discovery] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(sites).where(publiclyActive()),
      db.select({ count: sql<number>`count(*)::int` }).from(founders).where(eq(founders.visibility, "public")),
      db.select({ kind: competitionPeriods.kind, count: sql<number>`count(*)::int` }).from(competitionPeriods)
        .where(and(eq(competitionPeriods.status, "closed"), sql`EXISTS (SELECT 1 FROM ranking_snapshots r JOIN sites s ON s.id=r.site_id WHERE r.period_id=${competitionPeriods.id} AND s.is_listed=true AND s.archived_at IS NULL AND s.lifecycle IN ('active','verified'))`)).groupBy(competitionPeriods.kind),
      getDiscovery(),
    ]);
    const counts: Record<SitemapSection, number> = {
      pages: staticPaths.length, sites: siteCount.count, founders: founderCount.count,
      categories: discovery.categories.length, technologies: discovery.technologies.length, countries: discovery.countries.length,
      weekly: periods.find((row) => row.kind === "weekly")?.count ?? 0,
      monthly: periods.find((row) => row.kind === "monthly")?.count ?? 0, blog: getAllPosts().length,
    };
    paths = sitemapSections.flatMap((section) => Array.from({ length: Math.ceil(counts[section] / pageSize) }, (_, page) => `/sitemaps/${section}/${page}.xml`));
  }
  return '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + paths.map((path) => `<sitemap><loc>${xmlEscape(siteConfig.url + path)}</loc></sitemap>`).join("") + "</sitemapindex>";
}
export async function sitemapDocument(section: SitemapSection, page: number) {
  if (siteConfig.isDemo) return urls([]);
  if (!Number.isInteger(page) || page < 0 || page > 10000) throw new AppError("NOT_FOUND", "Sitemap not found.", 404);
  if (section === "pages") return urls(page === 0 ? staticPaths.map((path) => ({ path })) : []);
  if (section === "blog") return urls(getAllPosts().slice(page * pageSize, (page + 1) * pageSize).map((post) => ({ path: `/blog/${encodeURIComponent(post.slug)}`, modified: new Date(post.date) })));
  const db = database();
  if (section === "sites") return urls((await db.select({ slug: sites.slug, modified: sites.lastTestedAt, created: sites.createdAt }).from(sites).where(publiclyActive()).orderBy(asc(sites.id)).limit(pageSize).offset(page * pageSize)).map((row) => ({ path: `/site/${encodeURIComponent(row.slug)}`, modified: row.modified || row.created })));
  if (section === "founders") return urls((await db.select({ slug: founders.slug, modified: founders.updatedAt }).from(founders).where(eq(founders.visibility, "public")).orderBy(asc(founders.id)).limit(pageSize).offset(page * pageSize)).map((row) => ({ path: `/founders/${encodeURIComponent(row.slug)}`, modified: row.modified })));
  if (section === "weekly" || section === "monthly") return urls((await db.select({ key: competitionPeriods.periodKey, modified: competitionPeriods.closedAt }).from(competitionPeriods).where(and(eq(competitionPeriods.kind, section), eq(competitionPeriods.status, "closed"), sql`EXISTS (SELECT 1 FROM ranking_snapshots r WHERE r.period_id=${competitionPeriods.id})`)).orderBy(asc(competitionPeriods.periodKey)).limit(pageSize).offset(page * pageSize)).map((row) => ({ path: `/${section}/${row.key}`, modified: row.modified })));
  const discovery = await getDiscovery();
  const rows = section === "categories" ? discovery.categories.map((row) => row.slug) : section === "technologies" ? discovery.technologies.map((row) => row.slug) : discovery.countries.map((row) => row.code.toLowerCase());
  return urls(rows.slice(page * pageSize, (page + 1) * pageSize).map((slug) => ({ path: `/${section}/${encodeURIComponent(slug)}` })));
}

/** Canonical search documents never include account or draft routes. */
export async function publicCorpusSummary() {
  const db = database();
  const rows = await db.select({ name: sites.name, slug: sites.slug, description: sites.description }).from(sites)
    .where(and(eq(sites.isListed, true), isNull(sites.archivedAt), inArray(sites.lifecycle, ["active", "verified"]))).orderBy(asc(sites.name)).limit(50);
  return rows.map((row) => `- ${row.name.replace(/[\r\n]/g, " ")}: ${siteConfig.url}/site/${encodeURIComponent(row.slug)} — ${row.description.replace(/[\r\n]/g, " ")}`);
}
