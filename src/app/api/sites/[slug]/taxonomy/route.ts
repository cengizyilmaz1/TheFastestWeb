import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { requireUser } from "@/lib/auth";
import { setSiteTaxonomy, siteTaxonomySchema } from "@/modules/catalog/service";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
export const PATCH = withApi(async (request, context: { params: Promise<{ slug: string }> }) => {
  const user = await requireUser(request), db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Website settings are unavailable.", 503);
  await enforceRateLimit("taxonomy-edit", user.id, 30, 3600);
  const [site] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.slug, (await context.params).slug), eq(sites.ownerId, user.id)));
  if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
  return NextResponse.json(await setSiteTaxonomy(user.id, site.id, await readJson(request, siteTaxonomySchema)), { headers: { "Cache-Control": "no-store" } });
});
