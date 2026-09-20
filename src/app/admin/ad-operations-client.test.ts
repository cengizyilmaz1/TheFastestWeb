import { afterEach, describe, expect, it, vi } from "vitest";
import { canReviewCreative, confirmAdAction, loadAdReport, previewAdAction, safeCreativeUrl, type AdPreview } from "./ad-operations-client";

afterEach(() => vi.unstubAllGlobals());
const action = { action: "ad.approve" as const, reservationId: "reserved-paid-ad", reason: "Reviewed paid creative and destination" };
const json = (value: unknown) => new Response(JSON.stringify(value));

describe("paid advertisement review", () => {
  it("offers recovery only for paid or eligible inactive creative, excluding published and expired ads", () => {
    const now = Date.parse("2030-01-01T00:00:00.000Z");
    const pending = { status: "pending", is_active: false };
    expect(canReviewCreative({ status: "paid" }, pending, now)).toBe(true);
    expect(canReviewCreative({ status: "active", ends_at: "2030-02-01T00:00:00.000Z" }, pending, now)).toBe(true);
    expect(canReviewCreative({ status: "active" }, { status: "active", is_active: false }, now)).toBe(true);
    for (const status of ["paid", "active"]) expect(canReviewCreative({ status }, { status: "active", is_active: true }, now)).toBe(false);
    for (const status of ["held", "refunded", "cancelled", "expired"]) expect(canReviewCreative({ status }, pending, now)).toBe(false);
    expect(canReviewCreative({ status: "active", ends_at: "2029-12-01T00:00:00.000Z" }, pending, now)).toBe(false);
    expect(canReviewCreative({ status: "active" }, undefined, now)).toBe(false);
  });
  it("reads bounded administration reports without mutating placement state", async () => {
    const request = vi.fn().mockResolvedValue(json({ rows: [], nextCursor: null }));
    vi.stubGlobal("fetch", request);
    await loadAdReport("ad-reservations", "next-record");
    expect(request.mock.calls[0][0]).toBe("/api/admin/report?section=ad-reservations&cursor=next-record");
    expect(request.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("requires a preview token and preserves the reviewed action when confirming publication", async () => {
    const preview: AdPreview = { before: { status: "paid", creative_name: "Example", creative_url: "https://example.com" }, proposed: action,
      token: "review-token", expiresAt: "2030-01-01T00:00:00.000Z", financialMutation: false };
    const request = vi.fn().mockResolvedValueOnce(json(preview)).mockResolvedValueOnce(json({ auditId: "audit-record" }));
    vi.stubGlobal("fetch", request);
    await expect(confirmAdAction({ ...preview, token: "" })).rejects.toThrow("Preview the advertisement change");
    expect(request).not.toHaveBeenCalled();
    const reviewed = await previewAdAction(action);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ operation: "preview", action });
    await confirmAdAction(reviewed);
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ operation: "confirm", action, token: "review-token" });
  });

  it("does not turn stored creative URLs into executable links", () => {
    expect(safeCreativeUrl("https://example.com/product")).toBe("https://example.com/product");
    for (const url of ["javascript:alert(1)", "data:text/html,test", "https://name:secret@example.com", "invalid", null]) expect(safeCreativeUrl(url)).toBeNull();
  });
});
