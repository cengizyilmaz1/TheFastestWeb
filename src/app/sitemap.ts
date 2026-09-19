import { MetadataRoute } from "next";
import { getDb } from "@/db/index";
import { sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllPosts } from "@/lib/blog";

const BASE_URL = "https://thefastestweb.site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/test`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/submit`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // Fetch all listed sites for dynamic pages
  const db = getDb();
  if (!db) return staticPages;

  try {
    const allSites = await db
      .select({ slug: sites.slug, lastTestedAt: sites.lastTestedAt })
      .from(sites)
      .where(eq(sites.isListed, true));

    const sitePages: MetadataRoute.Sitemap = allSites.map((site) => ({
      url: `${BASE_URL}/site/${site.slug}`,
      lastModified: site.lastTestedAt || new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

    const categoryPages: MetadataRoute.Sitemap = ["saas", "tool", "directory", "portfolio", "blog", "other"].map((cat) => ({
      url: `${BASE_URL}/fastest/${cat}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

    const tierPages: MetadataRoute.Sitemap = ["perfect", "90-plus", "80-plus"].map((tier) => ({
      url: `${BASE_URL}/leaderboard/${tier}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

    const blogPosts = getAllPosts();
    const blogPages: MetadataRoute.Sitemap = [
      { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.7 },
      ...blogPosts.map((post) => ({
        url: `${BASE_URL}/blog/${post.slug}`,
        lastModified: new Date(post.date),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];

    return [...staticPages, ...blogPages, ...categoryPages, ...tierPages, ...sitePages];
  } catch {
    return staticPages;
  }
}
