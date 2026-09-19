import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), getDb: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/db/index", () => ({ getDb: mocks.getDb }));
import { getCurrentUser } from "./auth";
beforeEach(() => { mocks.auth.mockReset(); mocks.getDb.mockReset(); });
it("preserves Next prerender control flow instead of converting it to a database error", async () => {
  const dynamicSignal = new Error("Dynamic server usage: headers");
  mocks.auth.mockRejectedValue(dynamicSignal);
  await expect(getCurrentUser()).rejects.toBe(dynamicSignal);
  expect(mocks.getDb).not.toHaveBeenCalled();
});
it("returns no account for an anonymous request without touching the DB", async () => {
  mocks.auth.mockResolvedValue(null);
  await expect(getCurrentUser()).resolves.toBeNull();
  expect(mocks.getDb).not.toHaveBeenCalled();
});
it("sanitizes real database errors", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "00000000-0000-4000-8000-000000000001" } });
  mocks.getDb.mockReturnValue({ select: () => { throw new Error("private connection detail"); } });
  await expect(getCurrentUser()).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE", status: 503 });
});
