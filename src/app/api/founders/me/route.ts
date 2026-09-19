import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { founderProfileSchema, getOwnFounder, saveFounderProfile } from "@/modules/founders/service";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
export const GET = withApi(async () => {
  const user = await requireUser();
  return NextResponse.json({ profile: await getOwnFounder(user.id) }, { headers: { "Cache-Control": "no-store" } });
});
export const PUT = withApi(async (request) => {
  const user = await requireUser(request);
  await enforceRateLimit("founder-edit", user.id, 20, 3600);
  return NextResponse.json({ profile: await saveFounderProfile(user.id, await readJson(request, founderProfileSchema)) }, { headers: { "Cache-Control": "no-store" } });
});
