import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/http/api";
import { requireAdmin } from "@/modules/admin/access";
import { listManagedRedirects, previewRedirect, saveRedirect } from "@/modules/redirects/admin";
import { redirectInputSchema } from "@/modules/redirects/policy";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
export const GET = withApi(async () => NextResponse.json(await listManagedRedirects(await requireAdmin()), { headers: { "Cache-Control": "no-store" } }));
export const POST = withApi(async request => {
  const actor = await requireAdmin(request);
  await enforceRateLimit("admin-redirects", actor.userId, 30, 60);
  const input = await readJson(request, z.object({ operation: z.enum(["preview", "confirm"]), rule: redirectInputSchema, token: z.string().max(2000).optional() }).strict(), 4096);
  const result = input.operation === "preview" ? await previewRedirect(actor, input.rule) : await saveRedirect(actor, input.rule, input.token ?? "");
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});

