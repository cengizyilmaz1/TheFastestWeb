import { auth } from "@/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { getSubmissionScreenshot } from "@/modules/submissions/service";

export const GET = withApi(async (_request, context: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to view your preview.", 401);
  await enforceRateLimit("submission-preview", session.user.id, 20, 60);
  const image = await getSubmissionScreenshot(session.user.id, (await context.params).id);
  return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/jpeg", "Content-Length": String(image.length),
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});
