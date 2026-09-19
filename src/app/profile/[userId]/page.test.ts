import { beforeEach, describe, expect, it, vi } from "vitest";
const { select, currentUser } = vi.hoisted(() => ({ select: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({ select }) }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: currentUser }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (path: string) => { throw new Error("REDIRECT:" + path); } }));
import Page, { metadata } from "./page";
const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.clearAllMocks(); currentUser.mockResolvedValue(null); select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }); });
describe("legacy account profile privacy", () => {
  it("does not expose an account to an anonymous visitor without a public founder profile", async () => {
    await expect(Page({ params: Promise.resolve({ userId: id }) })).rejects.toThrow("NOT_FOUND");
    expect(JSON.stringify(metadata)).not.toContain(id);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
  it("sends the account owner to their private dashboard", async () => {
    currentUser.mockResolvedValue({ id });
    await expect(Page({ params: Promise.resolve({ userId: id }) })).rejects.toThrow("REDIRECT:/dashboard");
  });
  it("redirects only an explicitly public founder result without rendering account data", async () => {
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ slug: "chosen-name" }]) }) }) });
    await expect(Page({ params: Promise.resolve({ userId: id }) })).rejects.toThrow("REDIRECT:/founders/chosen-name");
    expect(currentUser).not.toHaveBeenCalled();
  });
  it("rejects invalid account identifiers before querying", async () => {
    await expect(Page({ params: Promise.resolve({ userId: "invalid" }) })).rejects.toThrow("NOT_FOUND");
    expect(select).not.toHaveBeenCalled();
  });
});
