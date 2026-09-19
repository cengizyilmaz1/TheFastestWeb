import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
import type { PerformanceResult } from "@/modules/performance/service";
const mocks = vi.hoisted(() => ({ measure: vi.fn(), metadata: vi.fn(), badge: vi.fn() }));
vi.mock("@/modules/performance/service", async (original) => ({ ...await original<typeof import("@/modules/performance/service")>(), runPerformanceTest: mocks.measure }));
vi.mock("@/modules/sites/metadata", async (original) => ({ ...await original<typeof import("@/modules/sites/metadata")>(), loadSiteMetadata: mocks.metadata }));
vi.mock("@/infrastructure/browser/badge-verification", () => ({ getVerifiedBadge: mocks.badge }));
vi.mock("@/config/env", async (original) => {
  const actual = await original<typeof import("@/config/env")>();
  return { ...actual, getEnv: () => ({ ...actual.getEnv(), SCREENSHOTS_ENABLED: false }) };
});
import { startSubmissionPreparation, getSubmissionPreparation } from "@/modules/submissions/service";
import { processBackgroundJob } from "@/modules/jobs/service";
import { createListing } from "@/modules/sites/create-listing";
import { parseSiteMetadata } from "@/modules/sites/metadata";

const measurement: PerformanceResult = { score: 81, loadTimeMs: 2400, fcpMs: 1200, lcpMs: 2400, cls: 0.025, tbtMs: 120, ttiMs: null, siMs: 2300,
  fcpScore: .8, lcpScore: .8, clsScore: .9, tbtScore: .9, ttiScore: null, siScore: .8, fcp: "1.2s", lcp: "2.4s", clsDisplay: "0.025", tbt: "120ms", tti: "Unavailable", si: "2.3s", loadTime: "2.4s",
  lighthouseVersion: "13.0.0", rawResponse: {}, sampleCount: 2, metricsSource: "lab", methodologyVersion: "psi-v2-two-sample" };
beforeAll(prepareIntegrationDatabase, 30_000); afterAll(cleanupIntegrationDatabase);
beforeEach(async () => {
  await resetIntegrationData(); mocks.measure.mockReset().mockResolvedValue(measurement);
  mocks.metadata.mockReset().mockResolvedValue(parseSiteMetadata('<title>Example tools</title><meta name="description" content="Useful tools for a real website."><script src="/_next/static/a.js"></script>', "https://example.com/"));
  mocks.badge.mockReset().mockResolvedValue({ verified: true, status: "verified" });
});
async function user() { const id = randomUUID(); await fixtureSql()`INSERT INTO users(id,email,name,is_pro) VALUES(${id},${`${id}@example.invalid`},'Synthetic founder',true)`; return id; }
async function prepare(owner: string, url = "https://example.com") {
  const receipt = await startSubmissionPreparation(owner, { url });
  if (!("jobId" in receipt)) throw new Error("Expected new receipt");
  return receipt;
}
async function publishingInput(owner: string, url?: string) {
  const receipt = await prepare(owner, url); expect(await processBackgroundJob(receipt.jobId)).toEqual({ status: "succeeded" });
  const ready = await getSubmissionPreparation(owner, receipt.jobId);
  const [category] = await fixtureSql()`SELECT id FROM categories WHERE slug='tool'`;
  const [technology] = await fixtureSql()`SELECT id FROM technologies WHERE slug='nextjs'`;
  return { url: ready.url, name: "Example", description: "Useful tools for a real website.", category: "tool" as const, isListed: true,
    testResultId: ready.mobile!.id, desktopTestResultId: ready.desktop!.id, preparationId: ready.id, categoryIds: [category.id as string], technologyIds: [technology.id as string], countryCode: "TR" };
}

describe("URL-first durable submission", () => {
  it("deduplicates preparation and protects owner-only results", async () => {
    const owner = await user();
    const receipts = await Promise.all(Array.from({ length: 6 }, () => prepare(owner)));
    expect(new Set(receipts.map((item) => item.jobId)).size).toBe(1);
    await expect(getSubmissionPreparation(await user(), receipts[0].jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.measure).not.toHaveBeenCalled();
  });
  it("persists a successful strategy and retries only the incomplete strategy", async () => {
    const owner = await user(), receipt = await prepare(owner);
    mocks.measure.mockImplementation(async (_url, strategy) => { if (strategy === "desktop") throw new Error("Synthetic provider outage"); return measurement; });
    expect(await processBackgroundJob(receipt.jobId)).toEqual({ status: "retry" });
    const partial = await getSubmissionPreparation(owner, receipt.jobId); expect(partial.mobile?.result.sampleCount).toBe(2); expect(partial.desktop).toBeNull();
    await fixtureSql()`UPDATE background_jobs SET available_at=now() WHERE id=${receipt.jobId}`;
    mocks.measure.mockResolvedValue(measurement);
    expect(await processBackgroundJob(receipt.jobId)).toEqual({ status: "succeeded" });
    const complete = await getSubmissionPreparation(owner, receipt.jobId);
    expect(complete.mobile?.id).toBe(partial.mobile?.id); expect(complete.desktop?.result.sampleCount).toBe(2);
    expect(mocks.measure.mock.calls.filter((call) => call[1] === "mobile")).toHaveLength(1);
    expect(mocks.measure.mock.calls.filter((call) => call[1] === "desktop")).toHaveLength(2);
  });
  it("publishes taxonomy, country, founder links, social links and both real strategies atomically", async () => {
    const owner = await user(), input = await publishingInput(owner), founder = randomUUID();
    await fixtureSql()`INSERT INTO founders(id,user_id,slug,name,visibility) VALUES(${founder},${owner},'synthetic-founder','Synthetic founder','public')`;
    const site = await createListing(owner, { ...input, founderIds: [founder], tagline: "Tools for builders", socialLinks: [{ platform: "github", url: "https://github.com/example" }] });
    expect(site).toMatchObject({ lifecycle: "active", countryCode: "TR", tagline: "Tools for builders" });
    expect(await fixtureSql()`SELECT * FROM site_categories WHERE site_id=${site.id}`).toHaveLength(1);
    expect(await fixtureSql()`SELECT source,confidence FROM site_technologies WHERE site_id=${site.id}`).toEqual([expect.objectContaining({ source: "detected", confidence: .9 })]);
    expect(await fixtureSql()`SELECT * FROM founder_sites WHERE site_id=${site.id}`).toHaveLength(1);
    expect(await fixtureSql()`SELECT * FROM site_social_links WHERE site_id=${site.id}`).toHaveLength(1);
    expect(await fixtureSql()`SELECT name,properties FROM analytics_events WHERE site_id=${site.id}`)
      .toEqual([expect.objectContaining({ name: "site_submitted", properties: { visibility: "public" } })]);
    const tests = await fixtureSql()`SELECT strategy,sample_count FROM speed_tests WHERE site_id=${site.id} ORDER BY strategy`;
    expect(tests).toHaveLength(2); expect(tests.every((row) => row.sample_count === 2)).toBe(true);
    const duplicate = await startSubmissionPreparation(owner, { url: input.url });
    expect(duplicate).toMatchObject({ existing: true, site: { id: site.id, owned: true }, canClaim: false });
    expect(await startSubmissionPreparation(await user(), { url: input.url })).toMatchObject({ existing: true, site: { id: site.id }, canClaim: true });
  });
  it("rolls back invalid catalog and foreign founder choices without consuming the proofs", async () => {
    const owner = await user(), input = await publishingInput(owner);
    await expect(createListing(owner, { ...input, categoryIds: [randomUUID()] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(createListing(owner, { ...input, founderIds: [randomUUID()] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(await fixtureSql()`SELECT * FROM sites`).toHaveLength(0);
    expect(await fixtureSql()`SELECT * FROM analytics_events WHERE name='site_submitted'`).toHaveLength(0);
    expect((await fixtureSql()`SELECT consumed_at FROM verified_speed_tests`).every((row) => row.consumed_at === null)).toBe(true);
  });
  it("does not disclose a private duplicate or manufacture metadata when the page cannot be read", async () => {
    const owner = await user(); mocks.metadata.mockRejectedValue(new Error("Synthetic unavailable site"));
    const input = await publishingInput(owner);
    const status = await getSubmissionPreparation(owner, input.preparationId);
    expect(status.metadata).toBeNull(); expect(status.warnings).toHaveLength(1);
    await expect(createListing(owner, { ...input, isListed: false })).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(await fixtureSql()`SELECT id FROM sites`).toHaveLength(0);
    expect((await fixtureSql()`SELECT consumed_at FROM verified_speed_tests`).every((row) => row.consumed_at === null)).toBe(true);
    // Missing text fields remain editable, but transport identity must recover
    // before publishing so an outage cannot bypass redirect deduplication.
    mocks.metadata.mockResolvedValue(parseSiteMetadata("", input.url));
    await createListing(owner, { ...input, isListed: false });
    expect(await startSubmissionPreparation(await user(), { url: input.url })).toEqual({ existing: true, site: null, canClaim: false });
  });
  it("detects a verified redirect duplicate before spending measurements and rechecks current privacy", async () => {
    const owner = await user(), input = await publishingInput(owner), site = await createListing(owner, input);
    mocks.measure.mockClear();
    mocks.metadata.mockResolvedValue(parseSiteMetadata("", input.url));
    const contender = await user(), receipt = await prepare(contender, "http://old.example.com/");
    expect(await processBackgroundJob(receipt.jobId)).toEqual({ status: "succeeded" });
    expect((await getSubmissionPreparation(contender, receipt.jobId)).duplicate).toMatchObject({ existing: true, site: { id: site.id }, canClaim: true });
    expect(mocks.measure).not.toHaveBeenCalled();
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${site.id}`;
    expect((await getSubmissionPreparation(contender, receipt.jobId)).duplicate).toEqual({ existing: true, site: null, canClaim: false });
  });
  it("serializes different sources converging on the same final and canonical URL without rebinding proofs", async () => {
    const first = await user(), second = await user();
    const finalUrl = "https://www.example.com/landing", canonical = "https://www.example.com/product";
    mocks.metadata.mockResolvedValue(parseSiteMetadata(`<link rel="canonical" href="${canonical}">`, finalUrl));
    const left = await publishingInput(first, "http://example.com/old");
    const right = await publishingInput(second, "https://alias.example.org/");
    const outcomes = await Promise.allSettled([createListing(first, { ...left, name: "Left owner" }), createListing(second, { ...right, name: "Right owner" })]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT", status: 409 } });
    const [site] = await fixtureSql()`SELECT id,url,normalized_url,redirect_url FROM sites`;
    expect([left.url, right.url]).toContain(site.url);
    expect(site).toMatchObject({ normalized_url: canonical, redirect_url: finalUrl });
    expect(await fixtureSql()`SELECT normalized_url FROM verified_speed_tests WHERE consumed_at IS NOT NULL`).toEqual([
      expect.objectContaining({ normalized_url: site.url }), expect.objectContaining({ normalized_url: site.url }),
    ]);
    expect(await fixtureSql()`SELECT id FROM speed_tests`).toHaveLength(2);
    for (const alias of [site.url, finalUrl, canonical]) {
      expect(await startSubmissionPreparation(await user(), { url: alias })).toMatchObject({ existing: true, site: { id: site.id }, canClaim: true });
    }
  });
  it("does not let a cross-origin canonical hint reserve or claim another website", async () => {
    const first = await user(), existing = await createListing(first, await publishingInput(first));
    mocks.metadata.mockResolvedValue(parseSiteMetadata('<link rel="canonical" href="https://example.com/">', "https://tenant.example.org/"));
    const owner = await user(), input = await publishingInput(owner, "https://tenant.example.org/");
    expect((await getSubmissionPreparation(owner, input.preparationId)).duplicate).toBeNull();
    const site = await createListing(owner, { ...input, name: "Separate tenant" });
    expect(site).toMatchObject({ url: input.url, normalizedUrl: input.url, redirectUrl: null });
    expect(site.id).not.toBe(existing.id);
  });
  it("refuses to swap the measured source for its redirect target", async () => {
    mocks.metadata.mockResolvedValue(parseSiteMetadata("", "https://www.example.com/"));
    const owner = await user(), input = await publishingInput(owner);
    await expect(createListing(owner, { ...input, url: "https://www.example.com/" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await fixtureSql()`SELECT id FROM sites`).toHaveLength(0);
    expect((await fixtureSql()`SELECT consumed_at FROM verified_speed_tests`).every((row) => row.consumed_at === null)).toBe(true);
  });
});
