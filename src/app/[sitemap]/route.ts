import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { siteUrl } from "@/lib/seo/metadata";
import { parseSitemapFilename, sitemapDocument, sitemapPath } from "@/modules/seo/sitemaps";

export const dynamic = "force-dynamic";

// Next supports dynamic whole segments, not `sitemap-[section]-[page].xml`.
// Static application routes take precedence; only these exact filenames are
// accepted here, with no provisioned shard ceiling as the public corpus grows.
export const GET = withApi(async (request, context: { params: Promise<{ sitemap: string }> }) => {
  const { sitemap } = await context.params;
  const part = parseSitemapFilename(sitemap);
  if (!part) throw new AppError("NOT_FOUND", "Sitemap not found.", 404);
  if (new URL(request.url).search) throw new AppError("INVALID_REQUEST", "Use the canonical sitemap URL without query parameters.", 400);
  return new Response(await sitemapDocument(part.section, part.page), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      Link: `<${siteUrl(sitemapPath(part.section, part.page))}>; rel="canonical"`,
    },
  });
});
