import { siteConfig } from "@/config/site";
import { aboutPage } from "@/content/about";
import { publicPages } from "@/content/public-pages";
import { getAllPosts } from "@/lib/blog";
import { AppError } from "@/lib/http/errors";
import { publicationDates, recordedDate } from "@/lib/seo/metadata";
import { getCategoryCounts } from "@/modules/catalog/public-categories";
import { categoryPath } from "@/modules/catalog/categories";
import { countPublicFounders, listPublicFounderDiscovery } from "@/modules/founders/discovery";
import { getFounderPath } from "@/modules/founders/paths";
import { countPublicSites, discoveryOffset, discoveryPageSize, listPublicSiteRecords, withDiscoveryAvailability } from "./public-corpus";
import { markdownText, type PublicPageContent } from "./markdown-format";

export const sitemapSections = ["pages", "sites", "blog", "categories", "founders"] as const;
export type SitemapSection = typeof sitemapSections[number];
export const sitemapPageSize = discoveryPageSize;
type Entry = { path: string; modified?: Date | string | null };
export const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const staticPaths = ["/", "/test", "/submit", "/pricing", "/advertise", "/about", "/blog", "/privacy", "/terms", "/categories",
  ...["perfect", "90-plus", "80-plus"].map((tier) => `/leaderboard/${tier}`)];
const notFound = () => new AppError("NOT_FOUND", "Sitemap not found.", 404);
const posts = () => getAllPosts().filter((post) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)).sort((a, b) => a.slug.localeCompare(b.slug, "en"));
async function populatedCategories() {
  const catalog = await getCategoryCounts();
  if (!catalog.available) throw new AppError("DATABASE_UNAVAILABLE", "Sitemaps are temporarily unavailable.", 503);
  return catalog.categories.filter((category) => category.count > 0).sort((a, b) => a.slug.localeCompare(b.slug, "en"));
}
function urls(entries: Entry[]) {
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((entry) => {
      const modified = recordedDate(entry.modified);
      return `  <url>\n    <loc>${xmlEscape(siteConfig.url + entry.path)}</loc>${modified ? `\n    <lastmod>${modified}</lastmod>` : ""}\n  </url>`;
    }), "</urlset>", ""].join("\n");
}
export async function sitemapIndex() {
  return withDiscoveryAvailability(async () => {
    let paths: string[] = [];
    if (!siteConfig.isDemo) {
      const [siteCount, founderCount, categories] = await Promise.all([countPublicSites(), countPublicFounders(), populatedCategories()]);
      const counts: Record<SitemapSection, number> = { pages: staticPaths.length, sites: siteCount, blog: posts().length, categories: categories.length, founders: founderCount };
      const total = sitemapSections.reduce((sum, section) => sum + Math.ceil(counts[section] / sitemapPageSize), 0);
      if (!Number.isSafeInteger(total) || total > 50_000) throw new AppError("SERVICE_UNAVAILABLE", "The sitemap index requires another index partition.", 503);
      paths = sitemapSections.flatMap((section) => Array.from({ length: Math.ceil(counts[section] / sitemapPageSize) }, (_, page) => `/sitemaps/${section}/${page}.xml`));
    }
    return ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...paths.map((path) => `  <sitemap>\n    <loc>${xmlEscape(siteConfig.url + path)}</loc>\n  </sitemap>`), "</sitemapindex>", ""].join("\n");
  });
}
export async function sitemapDocument(section: SitemapSection, page: number) {
  if (!sitemapSections.includes(section) || siteConfig.isDemo) throw notFound();
  const offset = discoveryOffset(page);
  return withDiscoveryAvailability(async () => {
    let entries: Entry[];
    if (section === "pages") {
      const content: PublicPageContent[] = [aboutPage, ...Object.values(publicPages)];
      entries = staticPaths.slice(offset, offset + sitemapPageSize).map((path) => ({ path, modified: content.find((entry) => entry.path === path)?.updated }));
    } else if (section === "blog") {
      entries = posts().slice(offset, offset + sitemapPageSize).map((post) => {
        const { datePublished, dateModified } = publicationDates(post.date, post.updated);
        return { path: `/blog/${encodeURIComponent(post.slug)}`, modified: dateModified ?? datePublished };
      });
    } else if (section === "categories") {
      entries = (await populatedCategories()).slice(offset, offset + sitemapPageSize).map((category) => ({ path: categoryPath(category.slug) }));
    } else if (section === "founders") {
      entries = (await listPublicFounderDiscovery(sitemapPageSize, offset)).map((founder) => ({ path: getFounderPath(founder.username), modified: founder.updatedAt }));
    } else {
      entries = (await listPublicSiteRecords(page)).map((row) => ({ path: `/site/${encodeURIComponent(row.slug)}`, modified: row.lastTestedAt || row.createdAt }));
    }
    if (!entries.length) throw notFound();
    return urls(entries);
  });
}

/** First bounded page only; complete exports are exposed by /llms/sites/{page}.md. */
export async function publicCorpusSummary() {
  if (siteConfig.isDemo) return [];
  return (await listPublicSiteRecords(0)).map((row) => `- ${markdownText(row.name)}: ${siteConfig.url}/site/${encodeURIComponent(row.slug)} — ${markdownText(row.description)}`);
}
