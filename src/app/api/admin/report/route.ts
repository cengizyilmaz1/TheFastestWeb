import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { requireAdmin } from "@/modules/admin/access";
import { adminSectionSchema, getAdminReport } from "@/modules/admin/queries";
import { enforceRateLimit } from "@/modules/security/rate-limit";

export const GET = withApi(async (request) => {
  const actor = await requireAdmin();
  await enforceRateLimit("admin-report", actor.userId, 120, 60);
  const url = new URL(request.url), section = adminSectionSchema.safeParse(url.searchParams.get("section") ?? "sites");
  if (!section.success) throw new AppError("NOT_FOUND", "Report not found.", 404);
  return NextResponse.json(await getAdminReport(actor, section.data, url.searchParams.get("cursor") ?? undefined), { headers: { "Cache-Control": "no-store" } });
});
