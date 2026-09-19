import { withApi } from "@/lib/http/api";
import { awardImageHeaders, generatePublicAwardPng } from "@/modules/awards/media";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=withApi<{params:Promise<{id:string}>}>(async(_request,context)=>new Response(
  new Uint8Array(await generatePublicAwardPng((await context.params).id)),{headers:awardImageHeaders("image/png")}));
