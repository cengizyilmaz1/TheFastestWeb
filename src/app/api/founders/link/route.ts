import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { linkFounderSite } from "@/modules/founders/service";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
export const POST = withApi(async (request) => {
  const user = await requireUser(request);
  await enforceRateLimit("founder-link", user.id, 30, 3600);
  const input = await readJson(request, z.object({ founderId: z.uuid(), siteId: z.uuid() }).strict());
  return NextResponse.json(await linkFounderSite(user.id, input.founderId, input.siteId), { headers: { "Cache-Control": "no-store" } });
});
