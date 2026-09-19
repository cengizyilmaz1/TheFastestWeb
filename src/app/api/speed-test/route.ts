import { NextRequest, NextResponse } from "next/server";
import { runStableSpeedTest } from "@/lib/pagespeed";
import { getDb } from "@/db/index";
import { speedChecks } from "@/db/schema";

// Simple in-memory rate limiting
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + 3600000 }); // 1 hour
    return true;
  }

  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// Simple cache for recent results
const cache = new Map<string, { data: unknown; expiresAt: number }>();

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const strategy =
    (request.nextUrl.searchParams.get("strategy") as "mobile" | "desktop") ||
    "mobile";

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL — must have a real domain with TLD
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.split(".");
    if (!parsed.hostname.includes(".") || parts[parts.length - 1].length < 2) {
      return NextResponse.json(
        { error: "Please enter a valid URL (e.g. yoursite.com)" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Rate limited — max 10 tests per hour. Please wait." },
      { status: 429 }
    );
  }

  // Check cache (5 minutes)
  const cacheKey = `${url}:${strategy}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data);
  }

  try {
    const psi = await runStableSpeedTest(url, strategy);

    const result = {
      score: psi.score,
      fcp: psi.fcp,
      lcp: psi.lcp,
      clsDisplay: psi.clsDisplay,
      tbt: psi.tbt,
      tti: psi.tti,
      si: psi.si,
      fcpMs: psi.fcpMs,
      lcpMs: psi.lcpMs,
      cls: psi.cls,
      tbtMs: psi.tbtMs,
      ttiMs: psi.ttiMs,
      siMs: psi.siMs,
      fcpScore: psi.fcpScore,
      lcpScore: psi.lcpScore,
      clsScore: psi.clsScore,
      tbtScore: psi.tbtScore,
      ttiScore: psi.ttiScore,
      siScore: psi.siScore,
    };

    // Cache for 5 minutes
    cache.set(cacheKey, { data: result, expiresAt: Date.now() + 300000 });

    // Track the speed check
    const db = getDb();
    if (db) {
      try {
        await db.insert(speedChecks).values({
          url,
          score: psi.score,
          loadTimeMs: psi.lcpMs ?? null,
          ip,
          userAgent: request.headers.get("user-agent") || null,
          strategy,
        });
      } catch (e) {
        console.error("[speed-check] insert failed:", e);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run speed test";
    const isClientError = message.includes("(400)") || message.includes("(404)") || message.includes("Invalid");
    return NextResponse.json(
      { error: message },
      { status: isClientError ? 400 : 500 }
    );
  }
}
