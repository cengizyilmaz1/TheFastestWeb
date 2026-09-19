import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { categories, countries, sites, siteCategories, siteTechnologies, technologies } from "@/db/schema";
import { AppError } from "@/lib/http/errors";

const uniqueIds = (maximum: number) => z.array(z.uuid()).max(maximum).refine((ids) => new Set(ids).size === ids.length, "Duplicate selection");
export const siteTaxonomySchema = z.object({
  categoryIds: uniqueIds(8).refine((ids) => ids.length > 0, "Choose a primary category"),
  technologyIds: uniqueIds(20),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
}).strict();

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "The catalog is temporarily unavailable.", 503);
  return db;
}

export async function getCatalog() {
  const db = database();
  const [categoryRows, technologyRows, countryRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name), asc(categories.id)).limit(500),
    db.select().from(technologies).where(eq(technologies.active, true)).orderBy(asc(technologies.name), asc(technologies.id)).limit(1000),
    db.select().from(countries).orderBy(asc(countries.name)),
  ]);
  return { categories: categoryRows, technologies: technologyRows, countries: countryRows };
}

export async function setSiteTaxonomy(userId: string, siteId: string, raw: unknown) {
  const input = siteTaxonomySchema.parse(raw);
  return database().transaction(async (tx) => {
    const [site] = await tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.ownerId, userId))).for("update");
    if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
    const selectedCategories = await tx.select({ id: categories.id }).from(categories)
      .where(and(inArray(categories.id, input.categoryIds), eq(categories.active, true)));
    const selectedTechnologies = input.technologyIds.length ? await tx.select({ id: technologies.id }).from(technologies)
      .where(and(inArray(technologies.id, input.technologyIds), eq(technologies.active, true))) : [];
    if (selectedCategories.length !== input.categoryIds.length || selectedTechnologies.length !== input.technologyIds.length) {
      throw new AppError("INVALID_REQUEST", "Choose active categories and technologies from the catalog.", 400);
    }
    if (input.countryCode) {
      const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode));
      if (!country) throw new AppError("INVALID_REQUEST", "Choose a supported ISO country code.", 400);
    }
    await tx.delete(siteCategories).where(eq(siteCategories.siteId, siteId));
    await tx.insert(siteCategories).values(input.categoryIds.map((categoryId, index) => ({ siteId, categoryId, isPrimary: index === 0 })));
    await tx.delete(siteTechnologies).where(eq(siteTechnologies.siteId, siteId));
    if (input.technologyIds.length) await tx.insert(siteTechnologies).values(input.technologyIds.map((technologyId) => ({ siteId, technologyId, source: "manual" as const })));
    if (input.countryCode !== undefined) await tx.update(sites).set({ countryCode: input.countryCode }).where(eq(sites.id, siteId));
    return { siteId, ...input };
  });
}
