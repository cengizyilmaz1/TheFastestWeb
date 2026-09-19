import { withApi } from "@/lib/http/api";
import { awardImageHeaders, getPublicAwardImage, renderAwardSvg } from "@/modules/awards/media";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=withApi<{params:Promise<{id:string}>}>(async(_request,context)=>new Response(
  renderAwardSvg(await getPublicAwardImage((await context.params).id)),{headers:awardImageHeaders("image/svg+xml")}));
