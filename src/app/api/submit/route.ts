import { NextRequest, NextResponse } from "next/server";
import { slugify } from "@/lib/utils";
import { getDb } from "@/db/index";
import { sites, speedTests, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { recalcAverageScore } from "@/lib/score";

// GET: Fetch metadata from a URL (server-side, no CORS issues)
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  const url = request.nextUrl.searchParams.get("url");

  if (action === "metadata" && url) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SpeedDirBot/1.0; +https://thefastestweb.site)",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        return NextResponse.json(
          { title: "", description: "" },
          { status: 200 }
        );
      }

      const html = await resp.text();

      // Extract title
      const ogTitleMatch = html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i
      );
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      let title = ogTitleMatch?.[1] || titleMatch?.[1] || "";

      // Strip taglines: "SiteName - Tagline" → "SiteName"
      title = title.split(/\s[-|—–:]\s/)[0].trim();

      // Extract description
      const ogDescMatch = html.match(
        /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i
      );
      const metaDescMatch = html.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
      );
      const description = ogDescMatch?.[1] || metaDescMatch?.[1] || "";

      function decodeEntities(str: string): string {
        return str
          .replace(/&#x27;/g, "'")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
      }

      return NextResponse.json({
        title: decodeEntities(title),
        description: decodeEntities(description),
      });
    } catch {
      return NextResponse.json({ title: "", description: "" });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// POST: Submit a new site with speed test data
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to submit a website" },
        { status: 401 }
      );
    }
    const authUserId = session.user.id;

    const body = await request.json();
    const { url, name, description, twitterHandle, category, speedData, faviconUrl: clientFaviconUrl, isListed: wantListed } = body;

    if (!url || !name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
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

    // Generate slug — append random suffix to avoid collisions
    let slug = slugify(name);
    const domain = new URL(url).hostname;
    const faviconUrl = clientFaviconUrl || `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Check if URL already exists
    const existing = await db.select().from(sites).where(eq(sites.url, url)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "This website has already been submitted" },
        { status: 409 }
      );
    }

    // Check slug collision and append suffix if needed
    const slugExists = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
    if (slugExists.length > 0) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    // Get owner info from authenticated user
    const [dbUser] = await db.select().from(users).where(eq(users.id, authUserId)).limit(1);
    const ownerName = dbUser?.name || session.user.name || session.user.email?.split("@")[0] || "Anonymous";

    // Free users can only submit 1 site — Pro users get unlimited
    if (!dbUser?.isPro) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(eq(sites.ownerId, authUserId));

      if (count >= 1) {
        return NextResponse.json(
          { error: "Free accounts are limited to 1 website. Upgrade to Pro for unlimited listings." },
          { status: 403 }
        );
      }
    }

    // Update twitter handle on user record if provided
    if (twitterHandle && dbUser) {
      await db.update(users).set({ twitterHandle }).where(eq(users.id, authUserId));
    }

    // Build speed fields from speedData (sent from the client after testing)
    const currentScore = speedData?.score ?? 0;
    const loadTimeMs = speedData?.fcpMs ? speedData.fcpMs + (speedData?.tbtMs ?? 0) : null;
    const currentLoadTime = loadTimeMs ? `${(loadTimeMs / 1000).toFixed(1)}s` : null;

    // Insert site
    const [site] = await db
      .insert(sites)
      .values({
        slug,
        name,
        url,
        description: description || "",
        faviconUrl,
        ownerId: authUserId,
        ownerName,
        twitterHandle: twitterHandle || null,
        category: category || "other",
        tier: dbUser?.isPro ? "pro" : "free",
        isListed: wantListed !== false,
        requiresBadge: !dbUser?.isPro,
        currentScore,
        currentLoadTime,
        currentFcp: speedData?.fcp ?? null,
        currentLcp: speedData?.lcp ?? null,
        currentCls: speedData?.cls ?? null,
        currentTbt: speedData?.tbt ?? null,
        currentTti: speedData?.tti ?? null,
        currentSi: speedData?.si ?? null,
        trend: 0,
      })
      .returning();

    // Insert speed test record if we have speed data
    if (speedData && site) {
      await db.insert(speedTests).values({
        siteId: site.id,
        score: speedData.score ?? 0,
        loadTimeMs: loadTimeMs ?? 0,
        fcpMs: speedData.fcpMs ?? 0,
        lcpMs: speedData.lcpMs ?? 0,
        cls: speedData.clsRaw ?? 0,
        tbtMs: speedData.tbtMs ?? 0,
        ttiMs: speedData.ttiMs ?? 0,
        siMs: speedData.siMs ?? 0,
        strategy: "mobile",
      });

      // Recalculate average score (for first submission it's just the single score)
      await recalcAverageScore(site.id);
    }

    return NextResponse.json({
      id: site.id,
      slug: site.slug,
      name: site.name,
      score: speedData?.score ?? site.currentScore,
    });
  } catch (err) {
    console.error("Submit error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to submit site",
      },
      { status: 500 }
    );
  }
}
