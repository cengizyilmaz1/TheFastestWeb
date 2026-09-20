import { afterEach, describe, expect, it, vi } from "vitest";
import { sitemapDocument, sitemapIndex, sitemapSections, type SitemapSection } from "./sitemaps";
import robots from "@/app/robots";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
const { categoryCounts } = vi.hoisted(() => ({ categoryCounts: vi.fn() }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/modules/catalog/public-categories", () => ({ getCategoryCounts: categoryCounts }));
vi.mock("@/lib/blog", () => ({ getAllPosts: () => [{ slug: "published-guide", date: "2026-09-01" }] }));
afterEach(() => { vi.unstubAllEnvs(); getDb.mockReset(); categoryCounts.mockReset(); });

describe("search documents for the original public pages", () => {
  it("publishes only retained static pages and score/category collections", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "production");
    vi.stubEnv("SITE_URL", "https://example.invalid");
    const xml = await sitemapDocument("pages", 0);
    const paths = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    expect(paths).toEqual(["/", "/test", "/submit", "/pricing", "/advertise", "/about", "/blog", "/privacy", "/terms", "/categories",
      "/leaderboard/perfect", "/leaderboard/90-plus", "/leaderboard/80-plus"]);
    expect(getDb).not.toHaveBeenCalled();
    expect(await sitemapDocument("pages", 1)).not.toContain("<loc>");
  });

  it("keeps public site pagination without indexing removed sections or profiles", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "production");
    vi.stubEnv("SITE_URL", "https://example.invalid");
    getDb.mockReturnValue({ select: () => ({ from: () => ({ where: async () => [{ count: 5001 }] }) }) });
    categoryCounts.mockResolvedValue({ available: true, categories: [{ slug: "ai", count: 1 }] });
    const xml = await sitemapIndex();
    const paths = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    expect(paths).toEqual(["/sitemaps/pages/0.xml", "/sitemaps/sites/0.xml", "/sitemaps/sites/1.xml", "/sitemaps/blog/0.xml", "/sitemaps/categories/0.xml"]);
    expect(sitemapSections).toEqual(["pages", "sites", "blog", "categories"]);
    for (const removed of ["founders", "technologies", "countries", "weekly", "monthly"])
      await expect(sitemapDocument(removed as SitemapSection, 0)).rejects.toMatchObject({ status: 404 });
  });

  it("keeps demo search documents empty without accessing any database", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    expect(await sitemapIndex()).not.toContain("<loc>");
    for (const section of sitemapSections) expect(await sitemapDocument(section, 0)).not.toContain("<loc>");
    expect(getDb).not.toHaveBeenCalled();
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
  it("excludes empty category collections and never disguises a catalog outage as an empty sitemap", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "production");
    categoryCounts.mockResolvedValue({ available: true, categories: [{ slug: "ai", count: 2 }, { slug: "finance", count: 0 }] });
    const xml = await sitemapDocument("categories", 0);
    expect(xml).toContain("/fastest/ai");
    expect(xml).not.toContain("/fastest/finance");
    categoryCounts.mockResolvedValue({ available: false, categories: [] });
    await expect(sitemapDocument("categories", 0)).rejects.toMatchObject({ status: 503 });
  });
});
