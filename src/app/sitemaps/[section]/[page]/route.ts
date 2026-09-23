import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { siteUrl } from "@/lib/seo/metadata";
import { sitemapDocument, sitemapPath, sitemapSections, type SitemapSection } from "@/modules/seo/sitemaps";
export const dynamic = "force-dynamic";
export const GET = withApi(async (request, context: { params: Promise<{ section: string; page: string }> }) => {
  if (new URL(request.url).search) throw new AppError("INVALID_REQUEST", "Use the canonical sitemap URL without query parameters.", 400);
  const { section, page } = await context.params;
  if (!sitemapSections.includes(section as SitemapSection) || !/^(0|[1-9]\d{0,8})\.xml$/.test(page)) throw new AppError("NOT_FOUND", "Sitemap not found.", 404);
  const index = Number(page.slice(0, -4));
  // Previously submitted child URLs keep working. Validate existence before
  // redirecting so demo, empty and out-of-range parts retain their actual 404.
  await sitemapDocument(section as SitemapSection, index);
  return new Response(null, { status: 301, headers: {
    Location: siteUrl(sitemapPath(section as SitemapSection, index)),
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  } });
});
