import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { sitemapDocument, sitemapSections, type SitemapSection } from "@/modules/seo/sitemaps";
export const dynamic = "force-dynamic";
export const GET = withApi(async (request, context: { params: Promise<{ section: string; page: string }> }) => {
  if (new URL(request.url).search) throw new AppError("INVALID_REQUEST", "Use the canonical sitemap URL without query parameters.", 400);
  const { section, page } = await context.params;
  if (!sitemapSections.includes(section as SitemapSection) || !/^(0|[1-9]\d{0,8})\.xml$/.test(page)) throw new AppError("NOT_FOUND", "Sitemap not found.", 404);
  return new Response(await sitemapDocument(section as SitemapSection, Number(page.slice(0, -4))), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
});
