import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { assertSameOrigin, readJson } from "@/modules/security/request";
import { publicationSchema, normalizeSubmittedUrl } from "@/modules/sites/input";
import { createListing } from "@/modules/sites/create-listing";
import { loadSiteMetadata } from "@/modules/sites/metadata";

export const GET = withApi(async (request) => {
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to prepare your listing.", 401);
  await enforceRateLimit("metadata", session.user.id, 20, 3600);
  const url = normalizeSubmittedUrl(request.nextUrl.searchParams.get("url") || "");
  try {
    return NextResponse.json(await loadSiteMetadata(url), { headers: { "Cache-Control": "no-store" } });
  } catch {
    throw new AppError("UPSTREAM_UNAVAILABLE", "Website details could not be loaded. You can enter them manually.", 502);
  }
});
export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to submit your website.", 401);
  await enforceRateLimit("submit", session.user.id, 10, 3600);
  const input = await readJson(request, publicationSchema);
  const site = await createListing(session.user.id, input);
  return NextResponse.json({ success: true, site, slug: site.slug }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
