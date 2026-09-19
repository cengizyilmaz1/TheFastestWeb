import { withApi } from "@/lib/http/api";
import { sitemapIndex } from "@/modules/seo/sitemaps";
export const dynamic = "force-dynamic";
export const GET = withApi(async () => new Response(await sitemapIndex(), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } }));
