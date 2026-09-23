import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UnsafeUrlError } from "@/lib/security/public-url";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), metadata: vi.fn(), listing: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/modules/security/rate-limit", () => ({ enforceRateLimit: mocks.limit }));
vi.mock("@/modules/sites/metadata", () => ({ loadSiteMetadata: mocks.metadata }));
vi.mock("@/modules/sites/create-listing", () => ({ createListing: mocks.listing }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ SITE_URL: "https://example.com", NODE_ENV: "test" }) }));
import { GET, POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "synthetic-owner" } }); });
describe("submission metadata and required fields", () => {
  it("requires an account before attempting metadata lookup", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(new NextRequest("https://example.com/api/submit?url=https://public.example.org"), undefined)).status).toBe(401);
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it.each(["http://127.0.0.1", "http://169.254.169.254/latest/meta-data/", "http://localhost", "file:///etc/passwd"])("blocks unsafe autofill input %s", async (url) => {
    const response = await GET(new NextRequest(`https://example.com/api/submit?url=${encodeURIComponent(url)}`), undefined);
    expect(response.status).toBe(400);
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it("uses the guarded metadata loader with owner quotas and no cache", async () => {
    mocks.metadata.mockResolvedValue({ title: "Example", description: "A useful example website.", suggestedCategory: "tool" });
    const response = await GET(new NextRequest("https://example.com/api/submit?url=https://example.org"), undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.limit).toHaveBeenCalledWith("metadata", "synthetic-owner", 20, 3600);
    expect(mocks.metadata).toHaveBeenCalledWith("https://example.org/");
  });
  it("keeps private DNS/redirect destinations blocked without exposing upstream errors", async () => {
    mocks.metadata.mockRejectedValue(new UnsafeUrlError("private-network-details"));
    const response = await GET(new NextRequest("https://example.com/api/submit?url=https://example.org"), undefined);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private-network-details");
  });
  it.each([{ name: " " }, { description: "short" }, { category: "" }, { countryCode: null }])("rejects incomplete publication before database writes: %j", async (invalid) => {
    const body = { url: "https://example.org", name: "Example", description: "A useful example website.", category: "tool", countryCode: "TR",
      preparationId: "00000000-0000-4000-8000-000000000001", testResultId: "00000000-0000-4000-8000-000000000002", desktopTestResultId: "00000000-0000-4000-8000-000000000003", ...invalid };
    const response = await POST(new NextRequest("https://example.com/api/submit", { method: "POST", headers: { origin: "https://example.com", "content-type": "application/json" }, body: JSON.stringify(body) }), undefined);
    expect(response.status).toBe(400);
    expect(mocks.listing).not.toHaveBeenCalled();
  });
});
