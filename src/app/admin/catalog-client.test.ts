import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmCatalogAction, loadPaymentCatalog, previewCatalogAction } from "./catalog-client";

afterEach(() => vi.unstubAllGlobals());
const action = { key: "pro_lifetime", mode: "create" as const, reason: "Set up the original lifetime package" };
const json = (value: unknown) => new Response(JSON.stringify(value));

describe("explicit admin catalog confirmation", () => {
  it("loads status with a read-only request and does not sync automatically", async () => {
    const request = vi.fn().mockResolvedValue(json({ products: [] }));
    vi.stubGlobal("fetch", request);
    await loadPaymentCatalog();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe("/api/admin/payment-catalog");
    expect(request.mock.calls[0][1]).not.toHaveProperty("body");
    expect(request.mock.calls[0][1]).not.toHaveProperty("method");
  });

  it("previews the exact selected package without prices or credentials from the browser", async () => {
    const request = vi.fn().mockResolvedValue(json({ token: "preview-token" }));
    vi.stubGlobal("fetch", request);
    await previewCatalogAction(action);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ operation: "preview", ...action });
    expect(request).toHaveBeenCalledOnce();
  });

  it("requires a preview token before sending a confirmation", async () => {
    const request = vi.fn().mockResolvedValue(json({ status: "synced" }));
    vi.stubGlobal("fetch", request);
    await expect(confirmCatalogAction(action, "")).rejects.toThrow("Review the product sync");
    expect(request).not.toHaveBeenCalled();
    await confirmCatalogAction(action, "preview-token");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ operation: "confirm", ...action, token: "preview-token" });
  });

  it("surfaces a rejected or expired preview without retrying a provider action", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Preview expired. Review the product again." }), { status: 409 }));
    vi.stubGlobal("fetch", request);
    await expect(confirmCatalogAction(action, "old-token")).rejects.toThrow("Preview expired");
    expect(request).toHaveBeenCalledOnce();
  });
});
