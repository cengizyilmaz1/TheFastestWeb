import { NextResponse } from "next/server";
import { z } from "zod";
import { listDirectory } from "@/modules/sites/directory";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";

const query = z.object({ q: z.string().trim().max(100).default("") });

// Quick results for the command palette. It reads the same public, listed websites the directory shows.
export const GET = withApi(async (request) => {
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) throw new AppError("INVALID_REQUEST", "Invalid search.", 400);
  const result = await listDirectory({ q: parsed.data.q, limit: 6 });
  return NextResponse.json({
    total: result.total,
    sites: result.sites.map((site) => ({ slug: site.slug, name: site.name, tagline: site.tagline || site.description, category: site.category, score: site.lastTestedAt ? site.currentScore : null })),
  }, { headers: { "Cache-Control": "public, max-age=30" } });
});
