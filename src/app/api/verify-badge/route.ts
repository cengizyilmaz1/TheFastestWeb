import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getVerifiedBadge } from "@/infrastructure/browser/badge-verification";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/modules/security/rate-limit";

export const runtime = "nodejs";

export const GET = withApi(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Please sign in to verify a badge.", 401);
  const url = request.nextUrl.searchParams.get("url");
  const slug = request.nextUrl.searchParams.get("slug");
  if (!url || !slug) throw new AppError("INVALID_REQUEST", "Missing URL or slug.", 400);
  await enforceRateLimit("badge", session.user.id, 10, 3600);

  const result = await getVerifiedBadge(url, slug);
  if (result.status === "invalid_url") throw new AppError("URL_BLOCKED", "Only public HTTP and HTTPS websites are allowed.", 400);
  const reason = result.status === "temporarily_unreachable"
    ? "Your site could not be fully checked. Please retry shortly."
    : result.status === "missing" ? "The badge was not found on your page." : undefined;
  return NextResponse.json({ ...result, reason }, { headers: { "Cache-Control": "no-store" } });
});
