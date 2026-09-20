import { siteConfig } from "@/config/site";
import { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (siteConfig.isDemo) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Crawlers must reach legacy profile URLs to observe their canonical 301.
      // The route itself returns 404 for private or missing profiles.
      disallow: ["/api/", "/auth/", "/admin", "/email-preview", "/badge-preview", "/links"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
