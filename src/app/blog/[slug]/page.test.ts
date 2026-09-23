import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page, { generateMetadata } from "./page";
import { articleMarkdown } from "@/modules/seo/markdown-format";
import type { Post } from "@/lib/blog";

const { getPost } = vi.hoisted(() => ({ getPost: vi.fn() }));
vi.mock("@/lib/blog", () => ({ getPost, getAllPosts: () => [], getRelatedPosts: () => [] }));
vi.mock("next-mdx-remote/rsc", () => ({ compileMDX: async () => ({ content: "Published article body." }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
const props = () => ({ params: Promise.resolve({ slug: "dated-guide" }) });
const post: Post = {
  slug: "dated-guide", title: "A dated guide", description: "A measured explanation.", date: "2026-03-01",
  author: "Original Writer", coverImage: "/images/journal-cover.png", coverAlt: "Journal",
  category: "guides", tags: [], readingTime: 1, content: "Published article body.",
};

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubEnv("SITE_URL", "https://example.invalid");
  vi.stubEnv("DEPLOYMENT_MODE", "production");
  getPost.mockReturnValue(post);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("article evidence across HTML, metadata and AI references", () => {
  it.each([undefined, "invalid", "2026-02-01"])("omits unsupported update dates (%s) in every representation", async (updated) => {
    const article = { ...post, updated };
    getPost.mockReturnValue(article);
    const metadata = await generateMetadata(props());
    expect(metadata.openGraph).toMatchObject({ publishedTime: "2026-03-01T00:00:00.000Z" });
    expect(metadata.openGraph).not.toHaveProperty("modifiedTime");
    const html = renderToStaticMarkup(await Page(props()));
    expect(html).toContain('dateTime="2026-03-01T00:00:00.000Z"');
    expect(html).not.toContain("Updated");
    expect(html).not.toContain("dateModified");
    expect(articleMarkdown(article).body).not.toContain("Updated:");
  });

  it("exposes the same recorded editorial update in every representation", async () => {
    const article = { ...post, updated: "2026-09-20" };
    getPost.mockReturnValue(article);
    expect((await generateMetadata(props())).openGraph).toMatchObject({ modifiedTime: "2026-09-20T00:00:00.000Z" });
    const html = renderToStaticMarkup(await Page(props()));
    expect(html).toContain('dateTime="2026-09-20T00:00:00.000Z"');
    expect(html).toContain('"dateModified":"2026-09-20T00:00:00.000Z"');
    expect(articleMarkdown(article).body).toContain("Updated: 2026-09-20T00:00:00.000Z");
  });
});
