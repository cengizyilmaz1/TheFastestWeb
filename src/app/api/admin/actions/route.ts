import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/http/api";
import { requireAdmin } from "@/modules/admin/access";
import { adminActionSchema, executeAdminAction, previewAdminAction } from "@/modules/admin/service";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";

export const POST = withApi(async (request) => {
  const actor = await requireAdmin(request);
  await enforceRateLimit("admin-action", actor.userId, 30, 60);
  const input = await readJson(request, z.object({ operation: z.enum(["preview", "confirm"]), action: adminActionSchema,
    token: z.string().max(2000).optional() }).strict(), 8192);
  const result = input.operation === "preview" ? await previewAdminAction(actor, input.action)
    : await executeAdminAction(actor, input.action, input.token ?? "");
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});
