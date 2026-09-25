import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBoundedCutoverLogger,
  createLegacyRedirectConsumer,
  loadLegacyRedirectManifest,
  manifestDigest,
  validateLegacyRedirectManifest,
  writeLegacyRedirectResponse,
} from "../runtime/legacy-redirects.mjs";

const temporaryDirectories: string[] = [];

function coverage(rules: Array<Record<string, unknown>>, badges: Array<Record<string, unknown>>) {
  return {
    knownRoutes: rules.length,
    redirects: rules.filter((item) => item.disposition === "redirect").length,
    gone: rules.filter((item) => item.disposition === "gone").length,
    review: rules.filter((item) => item.disposition === "review").length,
    sourceSites: rules.filter((item) => item.entityType === "site").length,
    sourceCategories: rules.filter((item) => item.entityType === "category" && String(item.sourcePath).startsWith("/fastest/")).length,
    sourceArticles: rules.filter((item) => item.entityType === "article" && String(item.sourcePath).startsWith("/blog/")).length,
    sourceFounders: rules.filter((item) => item.entityType === "founder" && !String(item.sourceEntityId).includes(":alias:")).length,
    sourceManagedRedirects: rules.filter((item) => item.entityType === "managed").length,
    managedRedirects: rules.filter((item) => item.entityType === "managed" && item.disposition === "redirect").length,
    managedRedirectReview: rules.filter((item) => item.entityType === "managed" && item.disposition === "review").length,
    badgeMappings: badges.filter((item) => item.status === "mapped").length,
    badgeReview: badges.filter((item) => item.status === "review").length,
    badgeGone: badges.filter((item) => item.status === "gone").length,
    queryPolicies: 2,
  };
}

function rule(sourcePath: string, destination: string | null, entityType = "static", disposition = "redirect") {
  return {
    sourcePath,
    disposition,
    status: disposition === "redirect" ? 301 : disposition === "gone" ? 410 : 0,
    destination,
    entityType,
    sourceEntityId: `${entityType}:${sourcePath}`,
    reason: "Reviewed unit-test route.",
  };
}

function unsignedManifest(input: { reviewRoute?: boolean; reviewBadge?: boolean } = {}) {
  const rules = [
    rule("/about", "/about"),
    rule("/blog", "/blog"),
    rule("/blog/example", "/blog/example", "article"),
    rule("/fastest/ai", "/speed/ai", "category"),
    rule("/founder/founder-one", "/founders/founder-one", "founder"),
    rule("/links", null, "static", "gone"),
    rule("/old", "/about", "managed"),
    rule("/site/example", input.reviewRoute ? null : "/products/example", "site", input.reviewRoute ? "review" : "redirect"),
  ];
  const badges = [input.reviewBadge ? {
    sourceType: "badge",
    sourceEntityId: "site-example",
    sourceImagePath: "/api/badge/example",
    destinationImage: null,
    targetHref: null,
    status: "review",
    reason: "Awaiting a reviewed target.",
    requiredContentType: "image/svg+xml",
    preserveQueryParameters: [],
    queryAdapter: null,
  } : {
    sourceType: "badge",
    sourceEntityId: "site-example",
    sourceImagePath: "/api/badge/example",
    destinationImage: "/badges/speed/example.svg",
    targetHref: "/products/example",
    status: "mapped",
    reason: "Reviewed speed badge mapping.",
    requiredContentType: "image/svg+xml",
    preserveQueryParameters: [],
    queryAdapter: "legacy-speed-badge-v1",
  }, {
    sourceType: "image",
    sourceEntityId: "journal-cover",
    sourceImagePath: "/images/journal-cover.png",
    destinationImage: "https://media.indietools.app/articles/speed/journal-cover.png",
    targetHref: null,
    status: "mapped",
    reason: "Reviewed immutable article cover.",
    requiredContentType: "image/*",
    preserveQueryParameters: [],
    queryAdapter: null,
  }, {
    sourceType: "avatar",
    sourceEntityId: "provider-avatar-pattern",
    sourceImagePath: "/api/avatar/:handle",
    destinationImage: null,
    targetHref: null,
    status: "gone",
    reason: "Reviewed retirement of provider avatars.",
    requiredContentType: "image/*",
    preserveQueryParameters: [],
    queryAdapter: null,
  }];
  return {
    schemaVersion: 1,
    manifestVersion: "THEFASTESTWEB_REDIRECTS_V1",
    sourceTreeSha256: "1".repeat(64),
    sourceDumpSha256: "2".repeat(64),
    generatedAt: "2026-09-25T18:00:00.000Z",
    origin: "https://thefastestweb.site",
    destinationOrigin: "https://www.indietools.app",
    unknownPathPolicy: 410,
    rules,
    badges,
    queryPolicies: [
      { sourcePath: "/blog", adapter: "legacy-pagination-consolidation-v1", acceptedParameters: ["page"] },
      { sourcePath: "/fastest/ai", adapter: "legacy-pagination-consolidation-v1", acceptedParameters: ["page"] },
    ],
    coverage: coverage(rules, badges),
  };
}

function signedManifest(input: { reviewRoute?: boolean; reviewBadge?: boolean } = {}) {
  const unsigned = unsignedManifest(input);
  return { ...unsigned, manifestDigest: manifestDigest(unsigned) };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("legacy redirect manifest", () => {
  it("accepts the checksummed zero-review V1 artifact", () => {
    const manifest = signedManifest();
    expect(validateLegacyRedirectManifest(manifest, { expectedDigest: manifest.manifestDigest })).toMatchObject({
      manifestVersion: "THEFASTESTWEB_REDIRECTS_V1",
      unknownPathPolicy: 410,
    });
  });

  it("rejects tampering, a wrong deployment pin and unresolved review entries", () => {
    const manifest = signedManifest();
    expect(() => validateLegacyRedirectManifest({ ...manifest, destinationOrigin: "https://attacker.invalid" }))
      .toThrowError("REDIRECT_MANIFEST_HEADER_INVALID");
    expect(() => validateLegacyRedirectManifest(manifest, { expectedDigest: "f".repeat(64) }))
      .toThrowError("REDIRECT_MANIFEST_PIN_MISMATCH");
    expect(() => validateLegacyRedirectManifest(signedManifest({ reviewRoute: true })))
      .toThrowError("REDIRECT_MANIFEST_UNRESOLVED_REVIEW");
    expect(() => validateLegacyRedirectManifest(signedManifest({ reviewBadge: true })))
      .toThrowError("REDIRECT_MANIFEST_UNRESOLVED_REVIEW");
  });

  it("loads only an absolute, digest-named, regular artifact", async () => {
    const manifest = signedManifest();
    const directory = await mkdtemp(join(tmpdir(), "tfw-redirects-"));
    temporaryDirectories.push(directory);
    const path = join(directory, `thefastestweb-redirects-v1-${manifest.manifestDigest.slice(0, 16)}.json`);
    await writeFile(path, JSON.stringify(manifest));
    await expect(loadLegacyRedirectManifest({ path: resolve(path), expectedDigest: manifest.manifestDigest }))
      .resolves.toMatchObject({ manifestDigest: manifest.manifestDigest });
    await expect(loadLegacyRedirectManifest({ path: resolve(path), expectedDigest: "a".repeat(64) }))
      .rejects.toThrowError("REDIRECT_MANIFEST_FILENAME_INVALID");
  });
});

describe("legacy redirect decisions", () => {
  const consumer = createLegacyRedirectConsumer(validateLegacyRedirectManifest(signedManifest()));

  it("performs one direct permanent hop and strips tracking parameters", () => {
    expect(consumer.resolve("/site/example?utm_source=archive&gclid=redacted")).toMatchObject({
      type: "redirect",
      status: 301,
      location: "https://www.indietools.app/products/example",
    });
    expect(consumer.resolve("/about/")).toMatchObject({
      type: "redirect",
      location: "https://www.indietools.app/about",
    });
  });

  it("consolidates only reviewed pagination families", () => {
    expect(consumer.resolve("/blog?page=12&utm_campaign=legacy")).toMatchObject({
      type: "redirect",
      location: "https://www.indietools.app/blog",
    });
    expect(consumer.resolve("/fastest/ai?page=2")).toMatchObject({
      type: "redirect",
      location: "https://www.indietools.app/speed/ai",
    });
    for (const target of [
      "/about?page=2",
      "/blog?page=0",
      "/blog?page=2&page=3",
      "/blog?category=ai",
    ]) expect(consumer.resolve(target)).toMatchObject({ type: "gone", status: 410 });
  });

  it("adapts legacy badge queries with first-value semantics and no passthrough", () => {
    expect(consumer.resolve("/api/badge/example")).toMatchObject({
      type: "redirect",
      location: "https://www.indietools.app/badges/speed/example.svg?theme=dark&variant=glow",
      image: true,
    });
    expect(consumer.resolve("/api/badge/example?theme=invalid&theme=light&variant=speedometer&variant=scorecard&preview=99&domain=spoof.test")).toMatchObject({
      type: "redirect",
      location: "https://www.indietools.app/badges/speed/example.svg?theme=dark&variant=speedometer",
      image: true,
    });
  });

  it("returns 410 for unknown routes and never sends image routes into the HTML app", () => {
    for (const target of ["/missing", "/%61bout", "/api/badge/missing", "/api/avatar/someone", "/api/awards/1/share.png"]) {
      expect(consumer.resolve(target)).toMatchObject({ type: "gone", status: 410 });
    }
    expect(consumer.resolve("/health/live")).toEqual({ type: "pass" });
    expect(consumer.resolve("/health/redirect-cutover")).toMatchObject({ type: "health", status: 200 });
  });

  it("redirects reviewed immutable media and applies pattern-level 410 decisions", () => {
    expect(consumer.resolve("/images/journal-cover.png?utm_source=legacy")).toMatchObject({
      type: "redirect",
      status: 301,
      location: "https://media.indietools.app/articles/speed/journal-cover.png",
      image: true,
    });
    expect(consumer.resolve("/api/avatar/founder-one")).toMatchObject({
      type: "gone",
      status: 410,
      image: true,
    });
  });

  it("writes bodyless redirects and explicit plain-text gone responses", () => {
    const response = { writeHead: vi.fn(), end: vi.fn() };
    writeLegacyRedirectResponse(
      { method: "GET" },
      response,
      consumer.resolve("/site/example"),
    );
    expect(response.writeHead).toHaveBeenCalledWith(301, expect.objectContaining({
      Location: "https://www.indietools.app/products/example",
      "Content-Length": "0",
    }));
    expect(response.end).toHaveBeenCalledWith();

    response.writeHead.mockClear();
    response.end.mockClear();
    writeLegacyRedirectResponse({ method: "GET" }, response, consumer.resolve("/missing"));
    expect(response.writeHead).toHaveBeenCalledWith(410, expect.objectContaining({
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    }));
    expect(response.end.mock.calls[0]?.[0].toString()).toBe("Gone.\n");
  });

  it("bounds and redacts request decision logging", () => {
    let now = 0;
    const log = vi.fn();
    const bounded = createBoundedCutoverLogger(log, { limit: 2, windowMs: 1_000, clock: () => now });
    bounded({ code: "REDIRECT", rule: "route:one", manifest: "a".repeat(16) });
    bounded({ code: "GONE", rule: "gone:two", manifest: "a".repeat(16) });
    bounded({ code: "GONE", rule: "gone:three", manifest: "a".repeat(16) });
    expect(log).toHaveBeenCalledTimes(2);
    now = 1_001;
    bounded({ code: "HEALTH", manifest: "a".repeat(16) });
    expect(log).toHaveBeenNthCalledWith(3, "redirect_cutover.logs_suppressed", { count: 1 });
    expect(log).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(log.mock.calls)).not.toContain("utm_");
  });
});
