import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { promoteAwardImage } from "@/modules/awards/media";
export const runtime="nodejs";
export const POST=withApi<{params:Promise<{id:string}>}>(async(request,context)=>{
  const user=await requireUser(request);
  await readJson(request,z.object({visibility:z.literal("public")}).strict());
  await enforceRateLimit("award-promote",user.id,10,3600);
  return NextResponse.json(await promoteAwardImage((await context.params).id,user.id),{headers:{"Cache-Control":"no-store"}});
});
