import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sitemapDocument, sitemapIndex, sitemapSections, sitemapPageSize, type SitemapSection } from "./sitemaps";
import { GET as childRoute } from "@/app/sitemaps/[section]/[page]/route";
import robots from "@/app/robots";

const { countSites, listSites, categoryCounts, posts, countFounders, listFounders } = vi.hoisted(() => ({ countSites: vi.fn(), listSites: vi.fn(), categoryCounts: vi.fn(), posts: vi.fn(), countFounders: vi.fn(), listFounders: vi.fn() }));
vi.mock("./public-corpus", async (original) => ({ ...await original<object>(), countPublicSites: countSites, listPublicSiteRecords: listSites }));
vi.mock("@/modules/founders/discovery", () => ({ countPublicFounders: countFounders, listPublicFounderDiscovery: listFounders }));
vi.mock("@/modules/catalog/public-categories", () => ({ getCategoryCounts: categoryCounts }));
vi.mock("@/lib/blog", () => ({ getAllPosts: posts }));
const paths = (xml: string) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
const sites = (count: number) => Array.from({ length: count }, (_, index) => ({ slug: `site-${index}`, name: `Site ${index}`, description: "Published", createdAt: new Date("2026-01-01"), lastTestedAt: new Date("2026-09-01") }));
beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "production"); vi.stubEnv("SITE_URL", "https://example.invalid");
  countSites.mockResolvedValue(1); countFounders.mockResolvedValue(0); listFounders.mockResolvedValue([]);
  listSites.mockResolvedValue(sites(1)); posts.mockReturnValue([{ slug: "published-guide", date: "2026-09-01" }]);
  categoryCounts.mockResolvedValue({ available: true, categories: [{ slug: "ai", count: 1 }] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("sectioned canonical sitemaps", () => {
  it("retains public static routes, recorded content dates and rejects out-of-range pages", async () => {
    const xml = await sitemapDocument("pages", 0);
    expect(paths(xml)).toEqual(["/", "/test", "/submit", "/pricing", "/advertise", "/about", "/blog", "/privacy", "/terms", "/categories", "/leaderboard/perfect", "/leaderboard/90-plus", "/leaderboard/80-plus"]);
    expect(countSites).not.toHaveBeenCalled(); expect(listSites).not.toHaveBeenCalled();
    await expect(sitemapDocument("pages", 1)).rejects.toMatchObject({ status: 404 });
    expect(xml).toContain("<lastmod>"); expect(xml).not.toContain(new Date().toISOString());
  });
  it.each([[200, 1], [201, 2], [400, 2], [401, 3]])("publishes exactly the required child pages for %i records", async (count, expectedPages) => {
    const records = sites(count); countSites.mockResolvedValue(count);
    listSites.mockImplementation(async (page: number) => records.slice(page * 200, (page + 1) * 200));
    const indexPaths = paths(await sitemapIndex()).filter((path) => path.startsWith("/sitemaps/sites/"));
    expect(indexPaths).toHaveLength(expectedPages); expect(sitemapPageSize).toBe(200);
    const all: string[] = [];
    for (let page = 0; page < expectedPages; page++) {
      const part = paths(await sitemapDocument("sites", page)); expect(part.length).toBeLessThanOrEqual(200); all.push(...part);
    }
    expect(all).toHaveLength(count); expect(new Set(all).size).toBe(count);
    expect(all).toEqual(records.map((record) => `/site/${record.slug}`));
    await expect(sitemapDocument("sites", expectedPages)).rejects.toMatchObject({ status: 404 });
  });
  it("paginates public founders and never includes private account routes", async () => {
    countFounders.mockResolvedValue(201);
    listFounders.mockResolvedValue([{ username: "public-founder", name: "Public founder", updatedAt: new Date("2026-09-04") }]);
    const index = paths(await sitemapIndex());
    expect(index).toContain("/sitemaps/founders/1.xml");
    expect(sitemapSections).toEqual(["pages", "sites", "blog", "categories", "founders"]);
    const xml = await sitemapDocument("founders", 0);
    expect(paths(xml)).toEqual(["/founder/public-founder"]); expect(xml).not.toContain("/profile/");
    expect(listFounders).toHaveBeenCalledWith(200, 0);
    for (const removed of ["technologies", "countries", "weekly", "monthly"]) await expect(sitemapDocument(removed as SitemapSection, 0)).rejects.toMatchObject({ status: 404 });
  });
  it("sorts articles and categories deterministically and does not invent update dates", async () => {
    posts.mockReturnValue([{ slug: "z-guide", date: "2026-09-02", updated: "2026-01-01" }, { slug: "a-guide", date: "invalid" }]);
    const xml = await sitemapDocument("blog", 0);
    expect(paths(xml)).toEqual(["/blog/a-guide", "/blog/z-guide"]);
    expect(xml.match(/<lastmod>/g)).toHaveLength(1); expect(xml).toContain("2026-09-02T00:00:00.000Z");
    categoryCounts.mockResolvedValue({ available: true, categories: [{ slug: "finance", count: 1 }, { slug: "ai", count: 2 }, { slug: "saas", count: 0 }] });
    expect(paths(await sitemapDocument("categories", 0))).toEqual(["/fastest/ai", "/fastest/finance"]);
  });
  it("has no empty child sitemap, rejects duplicate zero-padding and query aliases", async () => {
    countSites.mockResolvedValue(0); posts.mockReturnValue([]); categoryCounts.mockResolvedValue({ available: true, categories: [] });
    expect(paths(await sitemapIndex())).toEqual(["/sitemaps/pages/0.xml"]);
    for (const page of ["00.xml", "01.xml", "-1.xml", "2.md"]) {
      const response = await childRoute(new NextRequest(`https://example.invalid/sitemaps/pages/${page}`), { params: Promise.resolve({ section: "pages", page }) });
      expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("no-store");
    }
    const response = await childRoute(new NextRequest("https://example.invalid/sitemaps/pages/0.xml?token=private"), { params: Promise.resolve({ section: "pages", page: "0.xml" }) });
    expect(response.status).toBe(400); expect(await response.text()).not.toContain("private");
  });
  it("keeps demo index empty and does not query any live discovery source", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    expect(paths(await sitemapIndex())).toEqual([]);
    for (const section of sitemapSections) await expect(sitemapDocument(section, 0)).rejects.toMatchObject({ status: 404 });
    expect(countSites).not.toHaveBeenCalled(); expect(countFounders).not.toHaveBeenCalled(); expect(categoryCounts).not.toHaveBeenCalled();
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
  it("reports database/catalog outages as 503 without exposing source errors", async () => {
    categoryCounts.mockResolvedValue({ available: false, categories: [] });
    await expect(sitemapDocument("categories", 0)).rejects.toMatchObject({ status: 503 });
    countSites.mockRejectedValue(new Error("postgres://private:secret@internal"));
    await expect(sitemapIndex()).rejects.toMatchObject({ status: 503, message: "Public discovery is temporarily unavailable." });
    listSites.mockRejectedValue(new Error("postgres://private:secret@internal"));
    const response = await childRoute(new NextRequest("https://example.invalid/sitemaps/sites/0.xml"), { params: Promise.resolve({ section: "sites", page: "0.xml" }) });
    expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.text()).not.toMatch(/private|secret|postgres|internal/);
  });
});
