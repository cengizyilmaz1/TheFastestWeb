import { describe, expect, it } from "vitest";
import { siteVisitLinkRel } from "./link-policy";

const ownerProduct = { tier: "free" as const, slug: "indietools", url: "https://indietools.app", ownerIsAdmin: true };
describe("server-approved owner product links", () => {
  it.each(["https://indietools.app", "https://indietools.app/", "https://www.indietools.app", "https://www.indietools.app/"])("follows the exact owned IndieTools root: %s", url => {
    expect(siteVisitLinkRel({ ...ownerProduct, url })).toBe("noopener noreferrer");
  });
  it("requires the actual listing owner's administrator role", () => {
    expect(siteVisitLinkRel({ ...ownerProduct, ownerIsAdmin: false })).toBe("nofollow noopener noreferrer");
  });
  it("requires the exact published product slug, even for an administrator", () => {
    expect(siteVisitLinkRel({ ...ownerProduct, slug: "indietools-copy" })).toBe("nofollow noopener noreferrer");
  });
  it.each([
    "https://indietools.app.attacker.example/", "https://attacker.example/?site=indietools.app",
    "https://indietools.app@attacker.example/", "https://owner@indietools.app/",
    "https://api.indietools.app/", "http://indietools.app/", "https://indietools.app:8443/",
    "https://indietools.app/other", "https://indietools.app/?redirect=elsewhere", "https://indietools.app/#other",
  ])("does not grant the owner exception to a different destination: %s", url => {
    expect(siteVisitLinkRel({ ...ownerProduct, url })).toBe("nofollow noopener noreferrer");
  });
  it("preserves ordinary free and Pro product behavior", () => {
    const ordinary = { slug: "other-product", url: "https://example.com/", ownerIsAdmin: false };
    expect(siteVisitLinkRel({ ...ordinary, tier: "free" })).toBe("nofollow noopener noreferrer");
    expect(siteVisitLinkRel({ ...ordinary, tier: "pro" })).toBe("noopener noreferrer");
  });
});
