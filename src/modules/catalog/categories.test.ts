import { describe, expect, it } from "vitest";
import { categoryCatalog, categorySlugs, indieCategorySlugs, legacyCategory, legacyCategorySlugs } from "./categories";
import { categoryPageNumber, hasCategoryFilters } from "./public-categories";
import { submissionSchema } from "@/modules/sites/input";

describe("expanded category publication contract", () => {
  it("accepts all public IndieTools categories and preserves every original submission choice", () => {
    const input = { url: "https://example.invalid", name: "Example", description: "A synthetic website description.", testResultId: "00000000-0000-4000-8000-000000000001" };
    expect(indieCategorySlugs).toHaveLength(15);
    expect(new Set(categorySlugs).size).toBe(23);
    expect(categoryCatalog.map((entry) => entry.slug).sort()).toEqual([...categorySlugs].sort());
    for (const category of categorySlugs) expect(submissionSchema.safeParse({ ...input, category }).success).toBe(true);
    for (const category of ["unknown", "AI", "../ai", "", "__proto__"]) expect(submissionSchema.safeParse({ ...input, category }).success).toBe(false);
    for (const category of legacyCategorySlugs) expect(legacyCategory(category)).toBe(category);
    expect(legacyCategory("ai")).toBe("other");
  });
  it("accepts only bounded unambiguous pagination and identifies noncanonical filters", () => {
    expect(categoryPageNumber({})).toBe(1);
    expect(categoryPageNumber({ page: "2" })).toBe(2);
    for (const page of ["0", "01", "2.5", "-1", "401", "1e2", ["1", "2"]]) expect(categoryPageNumber({ page })).toBeNull();
    expect(hasCategoryFilters({ page: "2" })).toBe(false);
    expect(hasCategoryFilters({ sort: "newest" })).toBe(true);
  });
});
