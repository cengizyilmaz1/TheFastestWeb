import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareWebsite, publishWebsite } from "./submission-client";

afterEach(() => vi.unstubAllGlobals());
const jobId = "00000000-0000-4000-8000-000000000001";
const mobileId = "00000000-0000-4000-8000-000000000002";
const desktopId = "00000000-0000-4000-8000-000000000003";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const result = {
  id: jobId, status: "succeeded", metadata: null,
  mobile: { id: mobileId, result: { score: 87 } },
  desktop: { id: desktopId, result: { score: 95 } },
};

describe("original submission form compatibility", () => {
  it("publishes server-owned preparation receipts instead of browser scores", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({ jobId }, 202))
      .mockResolvedValueOnce(json(result))
      .mockResolvedValueOnce(json({ success: true }, 201));
    vi.stubGlobal("fetch", request);
    const input = { url: "https://example.com", name: "Example", description: "A synthetic example website.", countryCode: "TR", isListed: true, speedData: { score: 100 } };
    expect((await publishWebsite(input)).status).toBe(201);
    const [path, options] = request.mock.calls[2];
    expect(path).toBe("/api/submit");
    expect(JSON.parse(options.body)).toMatchObject({ preparationId: jobId, testResultId: mobileId, desktopTestResultId: desktopId, countryCode: "TR" });
    expect(JSON.parse(options.body)).not.toHaveProperty("speedData");
  });
  it("does not start measurements or publish before an explicit valid country is chosen", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    for (const countryCode of ["", "ZZ", "EU", "tr", "../../private"]) {
      await expect(publishWebsite({ url: "https://example.com", name: "Example", description: "A synthetic example website.", countryCode, isListed: true }))
        .rejects.toThrow("country of origin");
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("never publishes an existing listing or incomplete two-device result", async () => {
    const request = vi.fn().mockResolvedValueOnce(json({ existing: true }));
    vi.stubGlobal("fetch", request);
    await expect(prepareWebsite("https://example.com")).rejects.toThrow("already listed");
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(json({ jobId }, 202)).mockResolvedValueOnce(json({ ...result, desktop: null }));
    await expect(prepareWebsite("https://example.com")).rejects.toThrow("expired");
    expect(request.mock.calls.some(([path]) => path === "/api/submit")).toBe(false);
  });
  it("reports preparation failures without converting them into a score", async () => {
    const request = vi.fn().mockResolvedValueOnce(json({ jobId }, 202)).mockResolvedValueOnce(json({ ...result, status: "failed" }));
    vi.stubGlobal("fetch", request);
    await expect(prepareWebsite("https://example.com")).rejects.toThrow("could not be measured");
  });
});
