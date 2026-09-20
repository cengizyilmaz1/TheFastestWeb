import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { select, publicFounder, resolve, auth } = vi.hoisted(() => ({ select: vi.fn(), publicFounder: vi.fn(), resolve: vi.fn(), auth: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({ select }) }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/modules/founders/service", () => ({ getPublicFounder: publicFounder }));
vi.mock("@/modules/founders/usernames", () => ({ resolveFounderUsername: resolve }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import Page, { generateMetadata } from "./page";
const id = "10000000-0000-4000-8000-000000000001", username = "chosen-name";
const props = () => ({ params: Promise.resolve({ username }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React);
  vi.stubEnv("SITE_URL", "https://canonical.example.invalid"); vi.stubEnv("SITE_NAME", "TheFastestWeb"); vi.stubEnv("DEPLOYMENT_MODE", "production");
  resolve.mockResolvedValue(null); publicFounder.mockResolvedValue(null); auth.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("canonical founder profile privacy", () => {
  it("does not expose an unpublished founder or its metadata to visitors", async () => {
    await expect(Page(props())).rejects.toThrow("NOT_FOUND");
    await expect(generateMetadata(props())).rejects.toThrow("NOT_FOUND");
    expect(publicFounder).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
  });
  it("rechecks publication before rendering", async () => {
    resolve.mockResolvedValue({ slug: username, userId: id, visibility: "public" });
    await expect(Page(props())).rejects.toThrow("NOT_FOUND");
    expect(publicFounder).toHaveBeenCalledWith(username);
  });
  it("uses the readable canonical URL and only chosen public identity", async () => {
    resolve.mockResolvedValue({ slug: username, userId: id, visibility: "public" });
    publicFounder.mockResolvedValue({ name: "Chosen public name", avatarUrl: "https://example.com/avatar.png", sites: [], socialLinks: [],
      email: "private@example.invalid", userId: id, isPro: true, twitterHandle: "private_handle" });
    const html = renderToStaticMarkup(await Page(props())), metadata = await generateMetadata(props());
    expect(html).toContain("Chosen public name"); expect(html).toContain("Avg. Score");
    expect(metadata.alternates).toEqual({ canonical: "https://canonical.example.invalid/founder/chosen-name" });
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    for (const value of ["private@example.invalid", "private_handle", id]) expect(html).not.toContain(value);
    expect(html).not.toContain("Only you can see this profile"); expect(html).not.toContain("Your profile address");
  });
  it("renders private account details only for their signed-in owner without public metadata", async () => {
    auth.mockResolvedValue({ user: { id } }); resolve.mockResolvedValue({ slug: username, userId: id, visibility: "private" });
    select.mockImplementation(() => ({ from: () => ({ where: () => ({
      limit: async () => [{ name: "Private account name", avatarUrl: "https://example.com/private.webp", twitterHandle: null, isPro: false }],
      orderBy: () => ({ limit: async () => [] }),
    }) }) }));
    const html = renderToStaticMarkup(await Page(props())), metadata = await generateMetadata(props());
    expect(html).toContain("Private account name"); expect(html).toContain("Only you can see this profile."); expect(html).toContain("Your profile address");
    expect(metadata.title).toEqual({ absolute: "My profile | TheFastestWeb" }); expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(metadata)).not.toContain("Private account name"); expect(publicFounder).not.toHaveBeenCalled();
  });
  it("rejects another account's private identity even if a resolver returns it", async () => {
    auth.mockResolvedValue({ user: { id: "10000000-0000-4000-8000-000000000002" } });
    resolve.mockResolvedValue({ slug: username, userId: id, visibility: "private" });
    await expect(Page(props())).rejects.toThrow("NOT_FOUND"); expect(select).not.toHaveBeenCalled();
  });
  it("rejects invalid names and noncanonical aliases", async () => {
    await expect(Page({ params: Promise.resolve({ username: "../../admin" }) })).rejects.toThrow("NOT_FOUND");
    expect(resolve).not.toHaveBeenCalled();
    resolve.mockResolvedValue({ slug: "new-name", userId: id, visibility: "public" });
    await expect(Page(props())).rejects.toThrow("NOT_FOUND"); expect(publicFounder).not.toHaveBeenCalled();
  });
});
