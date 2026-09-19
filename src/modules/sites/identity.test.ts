import { describe, expect, it } from "vitest";
import { websiteIdentity } from "./identity";
import { publicationSchema } from "./input";

describe("observed website identity", () => {
  it("retains source, final transport and same-origin canonical as three sorted identities", () => {
    expect(websiteIdentity("http://example.com/old?utm_source=fixture", {
      finalUrl: "https://www.example.com/landing", canonicalUrl: "https://www.example.com/product",
    })).toEqual({ sourceUrl: "http://example.com/old", finalUrl: "https://www.example.com/landing",
      canonicalUrl: "https://www.example.com/product", normalizedUrl: "https://www.example.com/product",
      redirectUrl: "https://www.example.com/landing",
      keys: ["http://example.com/old", "https://www.example.com/landing", "https://www.example.com/product"] });
  });
  it.each(["https://example.org/", "https://www.example.com/", "https://tenant.example.com/", "http://example.com/"])("does not treat a cross-origin canonical hint %s as an identity", (canonicalUrl) => {
    expect(websiteIdentity("https://example.com/", { finalUrl: "https://example.com/", canonicalUrl }))
      .toMatchObject({ normalizedUrl: "https://example.com/", redirectUrl: null, canonicalUrl: null, keys: ["https://example.com/"] });
  });
  it("accepts a verified transport redirect across origins without accepting another canonical origin", () => {
    expect(websiteIdentity("https://old.example.com/", { finalUrl: "https://example.org/", canonicalUrl: "https://unrelated.example.com/" }))
      .toMatchObject({ normalizedUrl: "https://example.org/", redirectUrl: "https://example.org/", canonicalUrl: null,
        keys: ["https://example.org/", "https://old.example.com/"] });
  });
  it("rejects corrupt private final addresses and keeps tenant paths distinct", () => {
    expect(() => websiteIdentity("https://example.com/", { finalUrl: "http://127.0.0.1/", canonicalUrl: null })).toThrow();
    expect(websiteIdentity("https://example.com/tenant-a").keys).not.toEqual(websiteIdentity("https://example.com/tenant-b").keys);
  });
  it("requires preparation in the public HTTP publication contract", () => {
    expect(publicationSchema.safeParse({ url: "https://example.com/", name: "Example", description: "Useful synthetic fixture.",
      category: "tool", isListed: true, testResultId: "00000000-0000-4000-8000-000000000001",
      desktopTestResultId: "00000000-0000-4000-8000-000000000002" }).success).toBe(false);
  });
});
