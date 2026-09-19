import { describe, expect, it } from "vitest";
import { getPostTags, getTopicGroup, headingIds, validCoverPath, type TableOfContentsEntry } from "./blog-content";
import { getAllPosts, getPaginatedPosts, getPost } from "./blog";

describe("journal content metadata", () => {
  it("uses literal existing topics and explicit bounded tags without inventing an author or topic", () => {
    expect(getPostTags("nextjs-vs-nuxt-speed", undefined)).toEqual(["Next.js", "Nuxt"]);
    expect(getPostTags("how-to-check-website-speed", undefined)).toEqual([]);
    expect(getPostTags("astro", ["Astro", " Astro ", "<script>", "a".repeat(41), null])).toEqual(["Astro"]);
    expect(getTopicGroup("what-are-core-web-vitals")).toBe("metrics");
  });
  it("rejects remote, traversal and active-image cover paths", () => {
    expect(validCoverPath("/images/journal-cover.png")).toBe(true);
    for (const path of ["https://private.invalid/image.png", "/images/../secret.png", "/images/cover.svg", "/images/cover.png?url=x", "//private.invalid/image.png"]) expect(validCoverPath(path)).toBe(false);
    expect(getPost("../private")).toBeNull();
  });
  it("filters real posts and paginates missing combinations without substituting other articles", () => {
    const all = getAllPosts();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((post) => post.author && post.coverImage && post.category)).toBe(true);
    expect(getPaginatedPosts(1, { tag: "Next.js" }).posts.every((post) => post.tags.includes("Next.js"))).toBe(true);
    expect(getPaginatedPosts(3, { category: "metrics", tag: "Astro" })).toMatchObject({ posts: [], currentPage: 1, total: 0 });
  });
  it("uses actual heading nodes including inline code and collision-free IDs; code blocks never enter the TOC", () => {
    const toc: TableOfContentsEntry[] = [];
    const heading = (text: string) => ({ type: "element", tagName: "h2", children: [{ type: "text", value: text }] });
    const tree = { type: "root", children: [heading("Setup"), heading("Setup"), heading("Setup-2"),
      { type: "element", tagName: "h3", children: [{ type: "text", value: "Use " }, { type: "element", tagName: "code", children: [{ type: "text", value: "next/font" }] }] },
      { type: "element", tagName: "pre", children: [{ type: "text", value: "## Not a heading" }] }] };
    headingIds(toc)()(tree);
    expect(toc.map((entry) => entry.id)).toEqual(["article-setup", "article-setup-2", "article-setup-2-2", "article-use-nextfont"]);
    expect(toc[3]).toMatchObject({ text: "Use next/font", depth: 3 });
    expect(new Set(toc.map((entry) => entry.id)).size).toBe(toc.length);
  });
});
