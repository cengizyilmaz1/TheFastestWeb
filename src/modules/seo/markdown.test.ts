import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as markdownRoute } from "@/app/markdown/[[...path]]/route";
import { GET as llmsRoute } from "@/app/llms.txt/route";
import { GET as fullRoute } from "@/app/llms-full.txt/route";
import { aboutPage } from "@/content/about";
import { publicPages } from "@/content/public-pages";
import { categoryCatalog } from "@/modules/catalog/categories";
import type { Post } from "@/lib/blog";
import { fullReference, getMarkdownDocument } from "./markdown";
import { publicPageMarkdown } from "./markdown-format";

const { getAllPosts, getPost, getCategoryListing } = vi.hoisted(() => ({
  getAllPosts: vi.fn(), getPost: vi.fn(), getCategoryListing: vi.fn(),
}));
vi.mock("@/lib/blog", () => ({ getAllPosts, getPost }));
vi.mock("@/modules/catalog/public-categories", () => ({ getCategoryListing }));

const article: Post = {
  slug: "published-guide", title: "A practical performance guide", description: "A published description.",
  date: "2025-06-04", author: "Original Writer", category: "guides", tags: [], readingTime: 2,
  coverImage: "/images/journal-cover.png", coverAlt: "Journal", content: "## Actual article\n\nFull public article prose.\n\n```js\nexport const useful = true;\n```",
};
const request = (path: string, headers?: HeadersInit) => new Request(`https://untrusted-request-host.invalid${path}`, { headers });
const route = (path: string[], suffix = "", headers?: HeadersInit) => markdownRoute(request(`/markdown/${path.join("/")}${suffix}`, headers), { params: Promise.resolve({ path }) });

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://example.invalid");
  vi.stubEnv("DEPLOYMENT_MODE", "production");
  getAllPosts.mockReturnValue([article]);
  getPost.mockImplementation((slug: string) => slug === article.slug ? article : null);
  getCategoryListing.mockResolvedValue({ available: true, total: 0, pages: 0, sites: [] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("the public Markdown boundary", () => {
  it("exports only the explicit public allowlist and never looks up arbitrary files or private records", async () => {
    for (const path of [["admin"], ["profile", "someone"], ["site", "private-draft"], ["api", "payments"],
      ["..", ".env"], ["blog", "..\\.env"], ["blog", "%2e%2e"], ["blog", "https://internal.invalid"],
      ["blog", "published-guide", "extra"], ["fastest", "unknown"]]) {
      expect(await getMarkdownDocument(path)).toBeNull();
    }
    expect(getPost).not.toHaveBeenCalled();
    expect(getCategoryListing).not.toHaveBeenCalled();
    const missing = await route(["blog", "missing-article"]);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await missing.text()).not.toContain("content/blog");
  });

  it("uses canonical configured URLs, clean Markdown and noindex rather than request headers", async () => {
    const response = await route(["about"], "", { Accept: "text/html", Cookie: "admin=true", "X-Forwarded-Host": "attacker.invalid" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(response.headers.get("link")).toContain('<https://example.invalid/about>; rel="canonical"');
    expect(response.headers.get("link")).toContain('<https://example.invalid/llms.txt>; rel="describedby"');
    expect(await response.text()).not.toMatch(/attacker\.invalid|untrusted-request-host|admin=true|__NEXT_DATA__/);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects all query variants before reading articles or querying the database", async () => {
    for (const suffix of ["?url=http://127.0.0.1", "?format=json", "?page=2", "?token=private-value"]) {
      const response = await route(["blog", article.slug], suffix);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).not.toContain("private-value");
    }
    expect(llmsRoute(request("/llms.txt?token=private-value")).status).toBe(400);
    expect(fullRoute(request("/llms-full.txt?url=http://localhost")).status).toBe(400);
    expect(getPost).not.toHaveBeenCalled();
    expect(getCategoryListing).not.toHaveBeenCalled();
  });

  it("keeps public-page prose aligned with the same source used by HTML", async () => {
    for (const page of [aboutPage, ...Object.values(publicPages)]) {
      const document = await getMarkdownDocument(page.path.slice(1).split("/"));
      expect(document?.body).toBe(publicPageMarkdown(page).body);
      expect(document?.canonicalPath).toBe(page.path);
      for (const section of page.sections) for (const paragraph of section.paragraphs) expect(document?.body).toContain(paragraph);
    }
    const body = (await getMarkdownDocument(["categories"]))!.body;
    for (const category of categoryCatalog) {
      expect(body).toContain(`/markdown/fastest/${category.slug}`);
      expect(body).toContain(category.description);
      expect(body).toContain(category.focus);
    }
  });

  it("preserves article body, attribution and actual dates without inventing a recent update", async () => {
    const response = await route(["blog", article.slug]);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Author: Original Writer");
    expect(body).toContain("Published: 2025-06-04T00:00:00.000Z");
    expect(body).toContain(article.content);
    expect(body).not.toContain("Updated:");
    expect(body).not.toContain("Author: Cengiz");
  });

  it("publishes only explicit measured category fields and no missing-score guesses", async () => {
    getCategoryListing.mockResolvedValue({ available: true, total: 2, pages: 1, sites: [
      { name: "Public [site]\n# forged", slug: "public-site", currentScore: 91, lastTestedAt: new Date("2026-09-01"),
        ownerId: "private-owner", ownerEmail: "hidden@example.invalid", checkoutSession: "secret-checkout" },
      { name: "Untested", slug: "untested", currentScore: 0, lastTestedAt: null },
    ] });
    const response = await route(["fastest", "ai"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("91/100; last tested: 2026-09-01T00:00:00.000Z");
    expect(body).toContain("No dated measurement available");
    expect(body).toContain("Public \\[site\\] # forged");
    expect(body).not.toMatch(/private-owner|hidden@example|secret-checkout|score: 0\/100/);
    expect(body).toContain("not real-user Core Web Vitals certification");
  });

  it("returns an uncached generic outage instead of claiming a category is empty or exposing errors", async () => {
    getCategoryListing.mockResolvedValueOnce({ available: false, total: 0, pages: 0, sites: [] });
    const unavailable = await route(["fastest", "ai"]);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("60");
    expect(await unavailable.text()).not.toContain("no published website results");
    getCategoryListing.mockRejectedValueOnce(new Error("postgres://private-user:secret@internal/hidden"));
    const error = await route(["fastest", "ai"]);
    expect(error.headers.get("cache-control")).toBe("no-store");
    expect(await error.text()).not.toMatch(/postgres|private-user|secret|internal\/hidden/);
  });

  it("keeps both references and every demo representation out of the search index", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    for (const response of [llmsRoute(), fullRoute(), await route(["about"]), await route([])]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });
});

describe("LLM reference completeness", () => {
  it("uses the concise file as a navigation guide and includes complete content in the full file", async () => {
    const short = await llmsRoute().text();
    const full = await fullRoute().text();
    expect(short).toMatch(/^# TheFastestWeb\n\n> /);
    expect(short).toContain("https://example.invalid/markdown/about");
    expect(short).toContain("https://example.invalid/markdown/blog");
    expect(short).not.toContain(article.content);
    expect(full).toContain(article.content);
    expect(full).toContain("Author: Original Writer");
    for (const page of [aboutPage, ...Object.values(publicPages)]) expect(full).toContain(publicPageMarkdown(page).body);
    expect(full).not.toMatch(/\/admin|\/api\/payments|\/profile\//);
  });

  it("keeps the combined reference bounded and reports omitted whole articles explicitly", () => {
    const large = { ...article, content: "a".repeat(256 * 1024) };
    getPost.mockReturnValue(large);
    const reference = fullReference();
    expect(reference.body).toContain("1 articles are outside this combined document");
    expect(reference.body).toContain("No article was partially reproduced");
    expect(reference.body).not.toContain(large.content);
    expect(Buffer.byteLength(reference.body)).toBeLessThanOrEqual(1024 * 1024);
  });
});
