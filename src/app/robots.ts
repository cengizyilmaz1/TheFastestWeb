import { siteConfig } from "@/config/site";
import { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (siteConfig.isDemo) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Public login/preview/legacy utility pages must be crawlable so their
      // noindex metadata (or 404) can be observed. Authentication protects admin
      // data; robots is only a crawl control for operational endpoints.
      // Legacy profile redirects likewise remain reachable by crawlers.
      disallow: ["/api/", "/admin"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
