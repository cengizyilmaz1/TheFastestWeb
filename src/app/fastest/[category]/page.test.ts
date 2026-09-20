import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

const { listing } = vi.hoisted(() => ({ listing: vi.fn() }));
vi.mock("@/modules/catalog/public-categories", async (original) => ({
  ...await original<typeof import("@/modules/catalog/public-categories")>(),
  getCategoryListing: listing,
}));
vi.mock("@/components/leaderboard/LeaderboardTable", () => ({ LeaderboardTable: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

const props = (category = "ai", search: Record<string, string | string[]> = {}) => ({
  params: Promise.resolve({ category }), searchParams: Promise.resolve(search),
});
beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://example.invalid");
  vi.stubEnv("DEPLOYMENT_MODE", "production");
  listing.mockReset().mockResolvedValue({ available: true, sites: [], total: 30, pages: 2 });
});
afterEach(() => vi.unstubAllEnvs());

describe("category search indexing boundaries", () => {
  it("indexes populated collections with category-specific canonical and social metadata", async () => {
    const metadata = await generateMetadata(props("developer-tools"));
    expect(metadata.alternates?.canonical).toBe("https://example.invalid/fastest/developer-tools");
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.title).toMatchObject({ absolute: expect.stringContaining("Developer tools") });
    expect(metadata.openGraph).toMatchObject({ url: "https://example.invalid/fastest/developer-tools" });
  });

  it("keeps each populated result page canonical to itself", async () => {
    const metadata = await generateMetadata(props("ai", { page: "2" }));
    expect(metadata.alternates?.canonical).toBe("https://example.invalid/fastest/ai?page=2");
    expect(metadata.title).toMatchObject({ absolute: expect.stringContaining("page 2") });
    expect(metadata.robots).toMatchObject({ index: true });
  });

  it("does not index empty collections, unavailable results or filter variants", async () => {
    expect((await generateMetadata(props("ai", { sort: "newest" }))).robots).toMatchObject({ index: false });
    listing.mockResolvedValue({ available: true, sites: [], total: 0, pages: 0 });
    expect((await generateMetadata(props())).robots).toMatchObject({ index: false });
    listing.mockResolvedValue({ available: false, sites: [], total: 0, pages: 0 });
    expect((await generateMetadata(props())).robots).toMatchObject({ index: false });
  });

  it("keeps populated demo collections out of search", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    expect((await generateMetadata(props())).robots).toMatchObject({ index: false, follow: false });
  });

  it("rejects unknown categories and invalid or nonexistent result pages", async () => {
    await expect(generateMetadata(props("not-a-category"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata(props("ai", { page: "0" }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata(props("ai", { page: ["1", "2"] }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata(props("ai", { page: "3" }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
