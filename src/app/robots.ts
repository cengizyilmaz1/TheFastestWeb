import { siteConfig } from "@/config/site";
import { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (siteConfig.isDemo) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/admin", "/profile/", "/email-preview", "/badge-preview", "/links"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
