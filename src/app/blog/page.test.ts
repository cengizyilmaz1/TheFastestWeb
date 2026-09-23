import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BlogPage, { generateMetadata } from "./page";
import { getAllPosts, POSTS_PER_PAGE } from "@/lib/blog";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
const props = (search: Record<string, string | string[]> = {}) => ({ searchParams: Promise.resolve(search) });

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://example.invalid");
  vi.stubEnv("DEPLOYMENT_MODE", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("blog archive discovery", () => {
  it("gives real archive pages their own canonical, title and indexable metadata", async () => {
    expect(getAllPosts().length).toBeGreaterThan(POSTS_PER_PAGE);
    const first = await generateMetadata(props());
    expect(first.alternates?.canonical).toBe("https://example.invalid/blog");
    expect((await generateMetadata(props({ page: "1" }))).alternates?.canonical).toBe(first.alternates?.canonical);
    const second = await generateMetadata(props({ page: "2" }));
    expect(second.alternates?.canonical).toBe("https://example.invalid/blog?page=2");
    expect(second.openGraph).toMatchObject({ url: "https://example.invalid/blog?page=2" });
    expect(second.title).toEqual({ absolute: "Website speed guides, page 2 | TheFastestWeb" });
    expect(second.robots).toMatchObject({ index: true, follow: true });
  });

  it.each(["0", "-1", "01", "2suffix", "2.5", "", "Infinity", "9007199254740992", ["1", "2"]])(
    "rejects malformed archive pages (%j) before producing content or metadata", async (page) => {
      await expect(generateMetadata(props({ page }))).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(BlogPage(props({ page }))).rejects.toThrow("NEXT_NOT_FOUND");
    },
  );

  it("does not clone the last page at nonexistent archive URLs", async () => {
    const page = String(Math.ceil(getAllPosts().length / POSTS_PER_PAGE) + 1);
    await expect(generateMetadata(props({ page }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(BlogPage(props({ page }))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("keeps query variants and demo archives out of the index", async () => {
    const filtered = await generateMetadata(props({ page: "2", sort: "latest" }));
    expect(filtered.alternates?.canonical).toBe("https://example.invalid/blog?page=2");
    expect(filtered.robots).toMatchObject({ index: false });
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    expect((await generateMetadata(props({ page: "2" }))).robots).toMatchObject({ index: false, follow: false });
  });
});
