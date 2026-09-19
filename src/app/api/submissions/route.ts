import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { assertSameOrigin, readJson } from "@/modules/security/request";
import { preparationInput, startSubmissionPreparation } from "@/modules/submissions/service";

export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to prepare your website.", 401);
  await enforceRateLimit("submission-prepare", session.user.id, 5, 3600);
  await enforceRateLimit("submission-global", "all", 30, 3600);
  const result = await startSubmissionPreparation(session.user.id, await readJson(request, preparationInput));
  return NextResponse.json(result, { status: "existing" in result ? 200 : 202, headers: { "Cache-Control": "no-store" } });
});
