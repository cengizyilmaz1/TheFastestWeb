import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { founders, sites } from "@/db/schema";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn(), where: vi.fn(), leftJoin: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/db", () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock("@/db/index", () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import SiteDetailPage, { generateMetadata } from "./page";

const publicSite = {
  id: "site-id", slug: "public-project", name: "Public project", url: "https://example.com/",
  isListed: true, archivedAt: null, lifecycle: "active", ownerId: null, ownerName: null,
  currentScore: 93, currentLoadTime: "1.2s", currentLcp: "1.1s", currentCls: "0.01",
  description: "Public project description", tier: "free", trend: 0,
  lastTestedAt: new Date("2026-09-19T12:00:00Z"),
  email: "private-account@example.invalid", privateNotes: "Confidential account notes",
};
const parameters = (slug = "private-project") => ({ params: Promise.resolve({ slug }) });
function query(rows: unknown[]) {
  const chain: Record<string, unknown> = { then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
  for (const method of ["from", "limit", "orderBy"]) chain[method] = () => chain;
  chain.where = (condition: unknown) => { mocks.where(condition); return chain; };
  chain.leftJoin = (table: unknown, condition: unknown) => { mocks.leftJoin(table, condition); return chain; };
  return chain;
}

function expectPublicQuery() {
  const dialect = new PgDialect();
  const condition = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
  expect(condition.sql).toContain('"sites"."is_listed" =');
  expect(condition.sql).toContain('"sites"."archived_at" is null');
  expect(condition.sql).toContain('"sites"."lifecycle" in');
  expect(condition.params).toEqual(["private-project", true, "active", "verified", "unreachable", "redirected", "parked"]);
  const attribution = dialect.sqlToQuery(mocks.leftJoin.mock.calls[0][1]);
  expect(attribution.sql).toContain('"founders"."visibility" =');
  expect(attribution.params).toEqual(["public"]);
}

describe("original public website report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SITE_URL", "https://canonical.example.invalid");
    vi.stubEnv("SITE_NAME", "TheFastestWeb");
    vi.stubEnv("DEPLOYMENT_MODE", "production");
    mocks.auth.mockResolvedValue(null);
    // PostgreSQL returns no row when the public visibility predicate excludes a report.
    mocks.select.mockReset().mockReturnValue(query([]));
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["an anonymous visitor", null],
    ["a different account", { user: { id: "different-user" } }],
    ["the private listing owner", { user: { id: "owner-id" } }],
  ])("hides private page content and metadata from %s", async (_label, session) => {
    mocks.auth.mockResolvedValue(session);
    await expect(generateMetadata(parameters())).rejects.toThrow("NOT_FOUND");
    await expect(SiteDetailPage(parameters())).rejects.toThrow("NOT_FOUND");
    expectPublicQuery();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("publishes metadata for a listed, nonarchived public report without private account fields", async () => {
    mocks.select.mockReturnValue(query([publicSite]));
    const metadata = await generateMetadata(parameters(publicSite.slug));
    expect(metadata.title).toEqual({ absolute: "example.com — website speed report | TheFastestWeb" });
    expect(metadata.description).toContain(publicSite.name);
    expect(metadata.description).toContain("recorded mobile PageSpeed score of 93/100");
    expect(metadata.alternates).toEqual({ canonical: "https://canonical.example.invalid/site/public-project" });
    expect(metadata.openGraph).toMatchObject({ url: "https://canonical.example.invalid/site/public-project", title: "example.com — website speed report | TheFastestWeb" });
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain(publicSite.email);
    expect(serialized).not.toContain(publicSite.privateNotes);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it.each([[null, false], [new Date("2026-09-19T12:00:00Z"), true]])("distinguishes an unmeasured zero from a recorded zero", async (lastTestedAt, measured) => {
    mocks.select.mockReturnValue(query([{ ...publicSite, lastTestedAt, currentScore: 0 }]));
    const metadata = await generateMetadata(parameters(publicSite.slug));
    expect(metadata.description?.includes("score of 0/100")).toBe(measured);
    expect(metadata.description?.includes("No recorded mobile performance score")).toBe(!measured);
  });

  it("keeps public reports noindex on a demo host", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    mocks.select.mockReturnValue(query([publicSite]));
    expect((await generateMetadata(parameters(publicSite.slug))).robots).toEqual({ index: false, follow: false });
  });

  it("selects explicit public columns and attributes ownership only to opted-in founders", async () => {
    await expect(generateMetadata(parameters())).rejects.toThrow("NOT_FOUND");
    const projection = mocks.select.mock.calls[0][0];
    expect(projection.slug).toBe(sites.slug);
    expect(projection.ownerId).toBe(founders.userId);
    expect(projection.ownerName).toBe(founders.name);
    for (const field of ["email", "twitterHandle", "rawResponse", "stripeCustomerId", "privateNotes"]) {
      expect(projection).not.toHaveProperty(field);
    }
    expectPublicQuery();
  });
});
