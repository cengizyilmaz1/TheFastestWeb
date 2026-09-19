import { siteConfig } from "@/config/site";
import { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/email-preview"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
