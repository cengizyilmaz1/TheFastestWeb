import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { getSubmissionPreparation } from "@/modules/submissions/service";

export const GET = withApi(async (_request, context: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to view your preparation request.", 401);
  await enforceRateLimit("submission-poll", session.user.id, 60, 60);
  return NextResponse.json(await getSubmissionPreparation(session.user.id, (await context.params).id), { headers: { "Cache-Control": "no-store" } });
});
