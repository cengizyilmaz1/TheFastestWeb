import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { speedChecks, verifiedSpeedTests } from "@/db/schema";
import { runPerformanceTest, PERFORMANCE_METHOD_VERSION } from "@/modules/performance/service";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { normalizeSubmittedUrl } from "@/modules/sites/input";

export const GET = withApi(async (request) => {
  const url = normalizeSubmittedUrl(request.nextUrl.searchParams.get("url") || "");
  const strategy = request.nextUrl.searchParams.get("strategy") || "mobile";
  if (strategy !== "mobile" && strategy !== "desktop") throw new AppError("INVALID_REQUEST", "Choose mobile or desktop.", 400);
  const session = await auth();
  const actor = session?.user?.id || "anonymous";
  // A global quota bounds upstream cost even if client forwarding headers are spoofed.
  await enforceRateLimit("psi-global", "all", 100, 3600);
  await enforceRateLimit("psi-actor", actor, session?.user?.id ? 10 : 20, 3600);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Testing is temporarily unavailable.", 503);
  const psi = await runPerformanceTest(url, strategy);
  const { rawResponse: _raw, ...result } = psi;
  void _raw;
  let testResultId: string | undefined;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    if (session?.user?.id) {
      const [proof] = await tx.insert(verifiedSpeedTests).values({
        userId: session.user.id, normalizedUrl: url, strategy, jobId: randomUUID(),
        result, methodologyVersion: PERFORMANCE_METHOD_VERSION, expiresAt,
      }).returning({ id: verifiedSpeedTests.id });
      testResultId = proof.id;
    }
    await tx.insert(speedChecks).values({ url, score: result.score, loadTimeMs: result.loadTimeMs, strategy });
  });
  return NextResponse.json({ ...result, testResultId, expiresAt: testResultId ? expiresAt.toISOString() : undefined }, { headers: { "Cache-Control": "no-store" } });
});
