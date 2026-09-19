import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/db/index", () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import SiteDetailPage, { generateMetadata } from "./page";

const privateSite = {
  id: "site-id", slug: "private-project", name: "Private workspace", url: "https://example.com/",
  isListed: false, ownerId: "owner-id", currentScore: 93, currentLoadTime: "1.2s",
};
const parameters = () => ({ params: Promise.resolve({ slug: privateSite.slug }) });

describe("private listing confidentiality", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue(null);
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [privateSite] }) }) });
  });

  it("does not expose private titles, URLs or scores through metadata to anonymous visitors", async () => {
    await expect(generateMetadata(parameters())).resolves.toEqual({});
  });

  it("returns not found for direct anonymous access", async () => {
    await expect(SiteDetailPage(parameters())).rejects.toThrow("NOT_FOUND");
  });

  it("denies a different authenticated user both metadata and page access", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "different-user" } });
    await expect(generateMetadata(parameters())).resolves.toEqual({});
    await expect(SiteDetailPage(parameters())).rejects.toThrow("NOT_FOUND");
  });

  it("allows the owner while keeping private metadata out of search indexes", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-id" } });
    await expect(generateMetadata(parameters())).resolves.toMatchObject({
      title: expect.stringContaining("93/100"), robots: { index: false, follow: false },
    });
  });

  it("keeps listed website metadata public without requiring login", async () => {
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ ...privateSite, isListed: true }] }) }) });
    const metadata = await generateMetadata(parameters());
    expect(metadata.title).toContain("93/100");
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
