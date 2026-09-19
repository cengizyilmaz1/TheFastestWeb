import { describe, expect, it } from "vitest";
import { parseSiteMetadata } from "./metadata";

describe("website metadata evidence", () => {
  it("extracts actual metadata, resolves safe assets, and preserves a canonical hint without changing transport", () => {
    const result = parseSiteMetadata('<title>Fallback</title><meta property="og:site_name" content="Real &amp; Useful"><meta name="description" content="A useful tool for developers."><link rel="icon" href="/icon.png"><link rel="canonical" href="https://www.example.com/"><meta property="og:image" content="/cover.jpg">', "http://example.com/");
    expect(result).toMatchObject({ title: "Real & Useful", description: "A useful tool for developers.", finalUrl: "http://example.com/", canonicalUrl: "https://www.example.com/",
      faviconUrl: "http://example.com/icon.png", ogImageUrl: "http://example.com/cover.jpg", suggestedCategory: "tool", technologies: [] });
    expect(result).not.toHaveProperty("countryCode");
  });
  it("rejects private/script assets and ignores comments or marketing text as technology evidence", () => {
    const result = parseSiteMetadata('<!-- <script src="/_next/static/fake.js"></script> --><title>We review React and WordPress</title><link rel="icon" href="http://127.0.0.1/logo"><meta property="og:image" content="javascript:alert(1)"><link rel="canonical" href="http://169.254.169.254/">', "https://example.com/");
    expect(result.technologies).toEqual([]); expect(result.faviconUrl).toBeNull(); expect(result.ogImageUrl).toBeNull(); expect(result.canonicalUrl).toBeNull();
  });
  it("reports only observed signatures with human-readable evidence", () => {
    const result = parseSiteMetadata('<script src="/_next/static/chunk.js"></script><script id="__NEXT_DATA__" type="application/json">{}</script><div data-v-app></div>', "https://example.com/", new Headers({ "server": "cloudflare", "cf-ray": "synthetic", "x-vercel-id": "synthetic" }));
    expect(result.technologies.map((item) => item.slug)).toEqual(["nextjs", "vue", "cloudflare", "vercel"]);
    expect(result.technologies.every((item) => item.evidence.length > 10 && item.confidence > 0 && item.confidence <= 1)).toBe(true);
    expect(result.technologies.some((item) => item.slug === "react")).toBe(false);
  });
});
