import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/db", () => ({ getDb: () => ({ select: mocks.select, selectDistinct: () => query([]),execute:()=>Promise.resolve([]) }) }));
vi.mock("@/modules/rankings/service",()=>({getSiteRankingPositions:()=>Promise.resolve({items:[]})}));
vi.mock("@/modules/payments/entitlements",()=>({hasSiteProAccess:()=>Promise.resolve(false)}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@phosphor-icons/react/dist/ssr", () => ({ ArrowUpRightIcon: () => null, GlobeHemisphereWestIcon: () => null }));

import SiteDetailPage, { generateMetadata } from "./page";

const privateSite = {
  id: "site-id", slug: "private-project", name: "Private workspace", url: "https://example.com/",
  isListed: false, ownerId: "owner-id", currentScore: 93, currentLoadTime: "1.2s",
  description: "Confidential project description", lifecycle: "active",
};
const parameters = () => ({ params: Promise.resolve({ slug: privateSite.slug }), searchParams: Promise.resolve({}) });
function query(rows: unknown[]) {
  const chain: Record<string, unknown> = { then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
  for (const method of ["from", "where", "limit", "orderBy", "innerJoin"]) chain[method] = () => chain;
  return chain;
}

describe("private listing confidentiality", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue(null);
    mocks.select.mockReset().mockReturnValue(query([])).mockReturnValueOnce(query([privateSite]));
  });

  it("does not expose private titles, URLs or scores through metadata to anonymous visitors", async () => {
    await expect(generateMetadata(parameters())).resolves.toEqual({ title: "Website report", robots: { index: false } });
  });

  it("returns not found for direct anonymous access", async () => {
    await expect(SiteDetailPage(parameters())).rejects.toThrow("NOT_FOUND");
  });

  it("denies a different authenticated user both metadata and page access", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "different-user" } });
    await expect(generateMetadata(parameters())).resolves.toEqual({ title: "Website report", robots: { index: false } });
    mocks.select.mockReturnValueOnce(query([privateSite]));
    await expect(SiteDetailPage(parameters())).rejects.toThrow("NOT_FOUND");
  });

  it("allows the owner while keeping private metadata out of search indexes", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-id" } });
    await expect(generateMetadata(parameters())).resolves.toMatchObject({
      title: expect.stringContaining(privateSite.name), robots: { index: false, follow: false },
    });
  });

  it("keeps listed website metadata public without requiring login", async () => {
    mocks.select.mockReset().mockReturnValue(query([])).mockReturnValueOnce(query([{ ...privateSite, isListed: true }]));
    const metadata = await generateMetadata(parameters());
    expect(metadata.title).toContain(privateSite.name);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
