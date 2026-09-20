import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { select, publicFounder } = vi.hoisted(() => ({ select: vi.fn(), publicFounder: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({ select }) }));
vi.mock("@/modules/founders/service", () => ({ getPublicFounder: publicFounder }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import Page, { generateMetadata } from "./page";
const id = "10000000-0000-4000-8000-000000000001";
const props = () => ({ params: Promise.resolve({ userId: id }) });
function profileLookup(rows: unknown[]) {
  select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITE_URL", "https://canonical.example.invalid");
  vi.stubEnv("SITE_NAME", "TheFastestWeb");
  vi.stubEnv("DEPLOYMENT_MODE", "production");
  vi.stubGlobal("React", React);
  profileLookup([]);
  publicFounder.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("original profile page privacy", () => {
  it("does not expose an account or identity metadata without an explicitly public profile", async () => {
    await expect(Page(props())).rejects.toThrow("NOT_FOUND");
    await expect(generateMetadata(props())).rejects.toThrow("NOT_FOUND");
    expect(publicFounder).not.toHaveBeenCalled();
  });
  it("rechecks public visibility before rendering a profile", async () => {
    profileLookup([{ slug: "chosen-name" }]);
    await expect(Page(props())).rejects.toThrow("NOT_FOUND");
    await expect(generateMetadata(props())).rejects.toThrow("NOT_FOUND");
    expect(publicFounder).toHaveBeenCalledWith("chosen-name");
  });
  it("renders the original profile using only chosen public identity", async () => {
    profileLookup([{ slug: "chosen-name" }]);
    publicFounder.mockResolvedValue({ name: "Chosen public name", avatarUrl: "https://example.com/avatar.png", sites: [], socialLinks: [],
      email: "private@example.invalid", userId: id, isPro: true, twitterHandle: "private_handle" });
    const markup = renderToStaticMarkup(await Page(props()));
    const metadata = await generateMetadata(props());
    expect(markup).toContain("Chosen public name");
    expect(markup).toContain("Avg. Score");
    expect(metadata.title).toEqual({ absolute: "Chosen public name — 0 public sites | TheFastestWeb" });
    expect(metadata.alternates).toEqual({ canonical: `https://canonical.example.invalid/profile/${id}` });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    for (const privateValue of ["private@example.invalid", "private_handle"]) expect(JSON.stringify(metadata)).not.toContain(privateValue);
    for (const privateValue of ["private@example.invalid", "private_handle", id]) expect(markup).not.toContain(privateValue);
    expect(markup).not.toContain(">Pro<");
    expect(markup).not.toContain("/founders/");
    expect(markup).not.toContain("/dashboard");
  });
  it("rejects invalid account identifiers before querying", async () => {
    await expect(Page({ params: Promise.resolve({ userId: "invalid" }) })).rejects.toThrow("NOT_FOUND");
    await expect(generateMetadata({ params: Promise.resolve({ userId: "invalid" }) })).rejects.toThrow("NOT_FOUND");
    expect(select).not.toHaveBeenCalled();
  });
});
