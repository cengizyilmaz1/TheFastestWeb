import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/modules/admin/access", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./payment-catalog-panel", () => ({ PaymentCatalogPanel: () => null }));

import AdminPage, { generateMetadata } from "./page";

beforeEach(() => vi.clearAllMocks());

describe("payment administration boundary", () => {
  it.each([401, 403])("hides both content and metadata after access failure %s", async (status) => {
    mocks.requireAdmin.mockRejectedValue(new AppError(status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", "Access denied", status));
    await expect(AdminPage()).rejects.toThrow("NOT_FOUND");
    await expect(generateMetadata()).rejects.toThrow("NOT_FOUND");
  });

  it("does not allow a moderator to open payment administration", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "moderator", role: "moderator" });
    await expect(AdminPage()).rejects.toThrow("NOT_FOUND");
    await expect(generateMetadata()).rejects.toThrow("NOT_FOUND");
  });

  it("marks authorized payment administration as private and noncanonical", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "administrator", role: "admin" });
    await expect(generateMetadata()).resolves.toMatchObject({ robots: { index: false, follow: false }, alternates: { canonical: null }, referrer: "no-referrer" });
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
  });

  it("does not mask service failures as authorization decisions", async () => {
    mocks.requireAdmin.mockRejectedValue(new AppError("DATABASE_UNAVAILABLE", "Unavailable", 503));
    await expect(generateMetadata()).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});
