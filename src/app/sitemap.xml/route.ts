import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { sitemapIndex } from "@/modules/seo/sitemaps";
export const dynamic = "force-dynamic";
export const GET = withApi(async (request) => {
  if (new URL(request.url).search) throw new AppError("INVALID_REQUEST", "Use the canonical sitemap URL without query parameters.", 400);
  return new Response(await sitemapIndex(), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
});
