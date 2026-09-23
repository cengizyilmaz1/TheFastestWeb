import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMetadata, recordedDate, siteUrl } from "./metadata";
import { articleSchema, identityGraph, webPageSchema } from "./structured-data";
import { safeJsonLd } from "./json-ld";

afterEach(() => vi.unstubAllEnvs());

describe("canonical metadata and truthful structured data", () => {
  it("uses the configured origin consistently without duplicate title suffixes", () => {
    vi.stubEnv("SITE_URL", "https://new-origin.example.invalid");
    vi.stubEnv("DEPLOYMENT_MODE", "production");
    const metadata = pageMetadata({ title: "Website speed guides", description: "Public guides.", path: "/blog?page=2" });
    expect(metadata.title).toEqual({ absolute: "Website speed guides | TheFastestWeb" });
    expect(metadata.alternates?.canonical).toBe("https://new-origin.example.invalid/blog?page=2");
    expect(metadata.openGraph).toMatchObject({ url: metadata.alternates?.canonical, siteName: "TheFastestWeb", images: [{ url: "https://new-origin.example.invalid/og.png" }] });
    expect(metadata.twitter).toMatchObject({ images: ["https://new-origin.example.invalid/og.png"] });
    expect(() => siteUrl("//outside.invalid/path")).toThrow();
    expect(() => siteUrl("/\\outside.invalid/path")).toThrow();
  });

  it("never allows page-level defaults to make a demo or private page indexable", () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    expect(pageMetadata({ title: "Public", description: "Description", path: "/" }).robots).toMatchObject({ index: false, follow: false });
    vi.stubEnv("DEPLOYMENT_MODE", "production");
    expect(pageMetadata({ title: "Private", description: "Description", path: "/profile/id", index: false, follow: false }).robots).toEqual({ index: false, follow: false });
  });

  it("keeps Googlebot and general follow directives consistent", () => {
    vi.stubEnv("DEPLOYMENT_MODE", "production");
    expect(pageMetadata({ title: "Page", description: "Description", path: "/", follow: false }).robots)
      .toMatchObject({ index: true, follow: false, googleBot: { index: true, follow: false } });
  });

  it("advertises Markdown only for supported public representations", () => {
    vi.stubEnv("SITE_URL", "https://example.invalid");
    expect(pageMetadata({ title: "About", description: "About", path: "/about" }).alternates).toEqual({
      canonical: "https://example.invalid/about", types: { "text/markdown": "https://example.invalid/markdown/about" },
    });
    for (const path of ["/admin", "/profile/id", "/blog?page=2", "/fastest/unknown", "/site/private-draft"]) {
      expect(pageMetadata({ title: "Page", description: "Page", path }).alternates).not.toHaveProperty("types");
    }
  });

  it("identifies the current operator without inventing founder history, search or social accounts", () => {
    vi.stubEnv("SITE_URL", "https://example.invalid");
    const graph = identityGraph();
    expect(graph["@graph"]).toContainEqual(expect.objectContaining({ "@type": "Person", name: "Cengiz YILMAZ", url: "https://cengizyilmaz.net" }));
    const encoded = JSON.stringify(graph);
    expect(encoded).not.toMatch(/Ramesh|SearchAction|sameAs|founder/);
    expect(encoded).toContain("https://example.invalid/#organization");
  });

  it("preserves article attribution and actual dates without synthesizing recency", () => {
    vi.stubEnv("SITE_URL", "https://example.invalid");
    const post = { slug: "guide", title: "A guide", description: "Description", date: "2025-06-04", author: "Original Writer", coverImage: "/images/journal-cover.png" };
    const article = articleSchema(post);
    expect(article.author).toEqual({ "@type": "Person", name: "Original Writer" });
    expect(article.datePublished).toBe("2025-06-04T00:00:00.000Z");
    expect(article).not.toHaveProperty("dateModified");
    expect(articleSchema({ ...post, updated: "2026-09-20" }).dateModified).toBe("2026-09-20T00:00:00.000Z");
    expect(articleSchema({ ...post, author: "TheFastestWeb" }).author).toMatchObject({ "@type": "Organization", name: "TheFastestWeb" });
    expect(recordedDate("invalid")).toBeUndefined();
    expect(webPageSchema({ path: "/about", name: "About", description: "About" })).not.toHaveProperty("dateModified");
  });

  it("escapes untrusted report and article names before they enter a script element", () => {
    const title = '</script><script>alert("stored")</script>';
    const graph = articleSchema({ slug: "guide", title, description: "&", date: "", author: "TheFastestWeb", coverImage: "/images/journal-cover.png" });
    const serialized = safeJsonLd(graph);
    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized).headline).toBe(title);
  });
});
