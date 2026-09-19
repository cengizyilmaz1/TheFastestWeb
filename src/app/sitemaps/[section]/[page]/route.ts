import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { sitemapDocument, sitemapSections, type SitemapSection } from "@/modules/seo/sitemaps";
export const dynamic = "force-dynamic";
export const GET = withApi(async (_request, context: { params: Promise<{ section: string; page: string }> }) => {
  const { section, page } = await context.params;
  if (!sitemapSections.includes(section as SitemapSection) || !/^\d{1,5}\.xml$/.test(page)) throw new AppError("NOT_FOUND", "Sitemap not found.", 404);
  return new Response(await sitemapDocument(section as SitemapSection, Number(page.slice(0, -4))), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
});
