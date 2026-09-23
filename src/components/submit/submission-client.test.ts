import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareWebsite, publishWebsite } from "./submission-client";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
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
    const input = { url: "https://example.com", name: "Example", description: "A synthetic example website.", category: "tool", countryCode: "TR", isListed: true, speedData: { score: 100 } };
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
      await expect(publishWebsite({ url: "https://example.com", name: "Example", description: "A synthetic example website.", category: "tool", countryCode, isListed: true }))
        .rejects.toThrow("country of origin");
    }
    expect(request).not.toHaveBeenCalled();
  });
  it.each([{ name: " " }, { name: "a" }, { description: "" }, { description: " short " }, { category: "" }, { category: "invented" }])("rejects incomplete details before spending measurement quota: %j", async (invalid) => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(publishWebsite({ url: "https://example.com", name: "Example", description: "A real website description.", category: "tool", countryCode: "TR", isListed: true, ...invalid })).rejects.toThrow();
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
  it("reports only confirmed queue state and completed device proofs while polling", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValueOnce(json({ jobId, status: "queued" }, 202))
      .mockResolvedValueOnce(json({ ...result, status: "pending", mobile: null, desktop: null }))
      .mockResolvedValueOnce(json({ ...result, status: "running", desktop: null }))
      .mockResolvedValueOnce(json(result));
    vi.stubGlobal("fetch", request);
    const status = vi.fn(), pending = prepareWebsite("https://example.com", status);
    await vi.advanceTimersByTimeAsync(4800);
    expect((await pending).id).toBe(jobId);
    expect(status.mock.calls.map(([value]) => value)).toEqual([
      "Your website measurement is queued.", "Your website measurement is queued.",
      "Mobile measurement is ready. Waiting for desktop results.", "Mobile and desktop measurements are ready.",
    ]);
    expect(status.mock.calls.every(([value]) => !/\d+%/.test(value))).toBe(true);
  });
  it("never reports completion for an expired proof or failed receipt", async () => {
    const status = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ jobId }, 202))
      .mockResolvedValueOnce(json({ ...result, desktop: null })));
    await expect(prepareWebsite("https://example.com", status)).rejects.toThrow("expired");
    expect(status).not.toHaveBeenCalled();
  });
});
