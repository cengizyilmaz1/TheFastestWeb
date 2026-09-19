import { describe, expect, it, vi } from "vitest";
import { createBadgeVerifier, hasBadgeImage } from "./badge-verification";

const applicationUrl = "https://thefastestweb.site";
const pageUrl = "https://example.com/";
const badge = '<a href="https://thefastestweb.site/site/example"><img src="https://thefastestweb.site/api/badge/example?variant=speedometer&amp;theme=dark"></a>';

describe("badge verification", () => {
  it("accepts the actual badge img with escaped query parameters", () => {
    expect(hasBadgeImage(badge, pageUrl, "example", applicationUrl)).toBe(true);
  });

  it.each([
    `<!-- ${badge} -->`, `<script>const example = '${badge}';</script>`, `<template>${badge}</template>`,
    '<img src="https://thefastestweb.site.evil.com/api/badge/example">',
    '<img src="https://thefastestweb.site/api/badge/example-other">',
    '<img src="https://thefastestweb.site/api/badge/example?preview=100">',
    '<img src="https://user@thefastestweb.site/api/badge/example">',
    '<img src="/api/badge/example">',
    '<div>thefastestweb.site/api/badge/example</div>',
  ])("rejects strings, comments, inert markup and forged image URLs", (html) => {
    expect(hasBadgeImage(html, pageUrl, "example", applicationUrl)).toBe(false);
  });

  it("uses the document base when resolving relative images", () => {
    expect(hasBadgeImage('<base href="https://thefastestweb.site/"><img src="/api/badge/example">', pageUrl, "example", applicationUrl)).toBe(true);
  });

  it("does not launch Chromium after successful static verification", async () => {
    const renderHtml = vi.fn();
    const verify = createBadgeVerifier({
      applicationUrl, renderHtml, fetchHtml: async () => ({ html: badge, url: pageUrl, headers: new Headers() }),
    });
    await expect(verify(pageUrl, "example")).resolves.toMatchObject({ verified: true, status: "verified" });
    expect(renderHtml).not.toHaveBeenCalled();
  });

  it("never labels a network/browser failure as a missing badge", async () => {
    const verify = createBadgeVerifier({
      applicationUrl,
      fetchHtml: async () => ({ html: "<html></html>", url: pageUrl, headers: new Headers() }),
      renderHtml: async () => { throw new Error("sandbox unavailable"); },
    });
    await expect(verify(pageUrl, "example")).resolves.toMatchObject({ verified: false, status: "temporarily_unreachable" });
  });

  it("returns missing only after a successful rendered-page check", async () => {
    const verify = createBadgeVerifier({
      applicationUrl,
      fetchHtml: async () => ({ html: "<html></html>", url: pageUrl, headers: new Headers() }),
      renderHtml: async () => ({ html: "<html></html>", url: pageUrl }),
    });
    await expect(verify(pageUrl, "example")).resolves.toMatchObject({ verified: false, status: "missing" });
  });
});
