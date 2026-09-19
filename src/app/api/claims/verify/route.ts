import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { verifyClaimSchema, verifySiteClaim } from "@/modules/claims/service";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
export const POST = withApi(async (request) => {
  const user = await requireUser(request);
  await enforceRateLimit("claim-verify", user.id, 15, 3600);
  return NextResponse.json(await verifySiteClaim(user.id, await readJson(request, verifyClaimSchema)), { headers: { "Cache-Control": "no-store" } });
});
