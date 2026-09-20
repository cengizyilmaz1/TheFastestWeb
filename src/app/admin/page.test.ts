import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), read: vi.fn() }));
vi.mock("@/modules/admin/access", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/modules/redirects/admin", () => ({ listManagedRedirects: mocks.read }));
vi.mock("@/modules/admin/dashboard", () => ({ getOverview: mocks.read, listUsers: mocks.read, listWebsites: mocks.read,
  getAdvertising: mocks.read, listPayments: mocks.read, listAudit: mocks.read, getStaff: mocks.read,
  userFilters: ["all"], websiteFilters: ["all"] }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./payment-catalog-panel", () => ({ PaymentCatalogPanel: () => null }));
vi.mock("./ad-operations-panel", () => ({ AdOperationsPanel: () => null }));
vi.mock("./_components/admin-nav", () => ({ AdminNav: () => null }));

import AdminLayout from "./layout";
import * as overview from "./page";
import * as users from "./users/page";
import * as websites from "./websites/page";
import * as ads from "./ads/page";
import * as payments from "./payments/page";
import * as audit from "./audit/page";
import * as redirects from "./redirects/page";

const searchParams = Promise.resolve({});
const pages = { overview, users, websites, ads, payments, audit, redirects } as const;
const surfaces: [string, () => Promise<unknown>][] = [["layout", () => AdminLayout({ children: null })],
  ...Object.entries(pages).flatMap(([name, page]): [string, () => Promise<unknown>][] => [
    [`${name} page`, () => (page.default as (props: { searchParams: Promise<object> }) => Promise<unknown>)({ searchParams })],
    [`${name} metadata`, () => page.generateMetadata()],
  ])];

beforeEach(() => vi.clearAllMocks());

describe("administrator panel boundary", () => {
  it.each(surfaces)("hides the %s from anonymous and unprivileged accounts", async (_name, render) => {
    for (const status of [401, 403]) {
      mocks.requireAdmin.mockRejectedValue(new AppError(status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", "Access denied", status));
      await expect(render()).rejects.toThrow("NOT_FOUND");
    }
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each(surfaces)("does not allow a moderator to open the %s", async (_name, render) => {
    mocks.requireAdmin.mockResolvedValue({ userId: "moderator", role: "moderator" });
    await expect(render()).rejects.toThrow("NOT_FOUND");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each(Object.entries(pages))("marks the authorized %s page as private and noncanonical", async (_name, page) => {
    mocks.requireAdmin.mockResolvedValue({ userId: "administrator", role: "admin" });
    await expect(page.generateMetadata()).resolves.toMatchObject({ robots: { index: false, follow: false }, alternates: { canonical: null }, referrer: "no-referrer" });
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
  });

  it("does not mask service failures as authorization decisions", async () => {
    mocks.requireAdmin.mockRejectedValue(new AppError("DATABASE_UNAVAILABLE", "Unavailable", 503));
    await expect(overview.generateMetadata()).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});
