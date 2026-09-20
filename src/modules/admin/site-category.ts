import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "@/db";
import { categories, siteCategories, sites } from "@/db/schema";
import { legacyCategory, type CategorySlug } from "@/modules/catalog/categories";
import { AppError } from "@/lib/http/errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Both the existing assignment and destination catalog state bind the preview. */
export async function readSiteCategoryState(tx: Transaction, siteId: string, slug: CategorySlug) {
  const [site] = await tx.select({ id: sites.id, category: sites.category }).from(sites).where(eq(sites.id, siteId)).for("update");
  if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
  const [selectedCategory] = await tx.select({ id: categories.id, slug: categories.slug, active: categories.active })
    .from(categories).where(eq(categories.slug, slug)).for("share");
  if (!selectedCategory?.active) throw new AppError("INVALID_REQUEST", "Choose an active category from the catalog.", 400);
  const assigned = await tx.select({ id: categories.id, slug: categories.slug, isPrimary: siteCategories.isPrimary })
    .from(siteCategories).innerJoin(categories, eq(categories.id, siteCategories.categoryId))
    .where(eq(siteCategories.siteId, siteId)).orderBy(asc(categories.slug));
  return { ...site, categories: assigned, selectedCategory };
}

/** Replace the primary assignment; preserve unrelated secondary taxonomy. */
export async function changeSitePrimaryCategory(tx: Transaction, siteId: string, slug: CategorySlug) {
  const state = await readSiteCategoryState(tx, siteId, slug);
  const obsolete = state.categories.filter((category) => category.id !== state.selectedCategory.id
    && (category.isPrimary || category.slug === "other" && slug !== "other")).map((category) => category.id);
  if (obsolete.length) await tx.delete(siteCategories).where(and(eq(siteCategories.siteId, siteId), inArray(siteCategories.categoryId, obsolete)));
  await tx.update(siteCategories).set({ isPrimary: false }).where(and(eq(siteCategories.siteId, siteId), ne(siteCategories.categoryId, state.selectedCategory.id)));
  await tx.insert(siteCategories).values({ siteId, categoryId: state.selectedCategory.id, isPrimary: true })
    .onConflictDoUpdate({ target: [siteCategories.siteId, siteCategories.categoryId], set: { isPrimary: true } });
  // Keep the legacy enum compatible; normalized taxonomy is authoritative.
  await tx.update(sites).set({ category: legacyCategory(slug) }).where(eq(sites.id, siteId));
}
