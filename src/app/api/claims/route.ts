import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { issueClaimSchema, issueSiteClaim } from "@/modules/claims/service";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
export const POST = withApi(async (request) => {
  const user = await requireUser(request);
  await enforceRateLimit("claim-issue", user.id, 5, 3600);
  return NextResponse.json(await issueSiteClaim(user.id, await readJson(request, issueClaimSchema)), { status: 201, headers: { "Cache-Control": "no-store" } });
});
