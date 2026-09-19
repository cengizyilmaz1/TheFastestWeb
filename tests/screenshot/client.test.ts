import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
const { env } = vi.hoisted(() => ({ env: { SCREENSHOTS_ENABLED: true, SCREENSHOT_SERVICE_URL: "https://screenshots.example.com", SCREENSHOT_SERVICE_TOKEN: "a".repeat(64),
  SCREENSHOT_CLIENT_ID: "thefastestweb", R2_PUBLIC_BASE_URL: "https://media.example.com" } }));
vi.mock("@/config/env", () => ({ getEnv: () => env }));
import { requestScreenshot, getScreenshot, type ScreenshotResponse } from "@/infrastructure/screenshots/client";
import { validatePublicScreenshot } from "@/modules/screenshots/service";

afterEach(() => { vi.unstubAllGlobals(); env.SCREENSHOTS_ENABLED = true; });
describe("TheFastestWeb screenshot adapter", () => {
  it("uses a durable request ID and authenticated client namespace", async () => {
    const id = randomUUID(), receipt = { id: randomUUID(), status: "pending" };
    const transport = vi.fn(async () => Response.json(receipt)); vi.stubGlobal("fetch", transport);
    expect(await requestScreenshot({ url: "https://example.com", visibility: "public" }, id)).toEqual(receipt);
    const [url, options] = transport.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe(env.SCREENSHOT_SERVICE_URL); expect(options.redirect).toBe("error");
    expect(options.headers).toMatchObject({ authorization: `Bearer thefastestweb.${env.SCREENSHOT_SERVICE_TOKEN}`, "idempotency-key": id });
    expect(JSON.parse(String(options.body))).toMatchObject({ visibility: "public", url: "https://example.com/" });
  });
  it("maps transport and oversized upstream errors without disclosing credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`secret ${env.SCREENSHOT_SERVICE_TOKEN}`); }));
    await expect(getScreenshot(randomUUID())).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", status: 503 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(65537))));
    await expect(getScreenshot(randomUUID())).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });
  it("does not contact the service while disabled", async () => {
    env.SCREENSHOTS_ENABLED = false; const transport = vi.fn(); vi.stubGlobal("fetch", transport);
    await expect(getScreenshot(randomUUID())).rejects.toMatchObject({ code: "FEATURE_DISABLED" }); expect(transport).not.toHaveBeenCalled();
  });
  it("accepts only unexpired public results for the requested website and project", () => {
    const key = `thefastestweb/sites/screenshots/desktop/${randomUUID()}/image.webp`;
    const artifact = { objectKey: key, publicUrl: `https://media.example.com/${key}`, width: 1440, height: 900, contentType: "image/webp" as const, size: 100, hash: "b".repeat(64) };
    const result: NonNullable<ScreenshotResponse["result"]> = { optimized: artifact, original: { ...artifact, contentType: "image/jpeg" }, finalUrl: "https://example.com/landing",
      title: "Example", capturedAt: new Date(Date.now() - 1000).toISOString(), retentionUntil: new Date(Date.now() + 86400_000).toISOString() };
    expect(validatePublicScreenshot(result, "https://example.com")).toEqual(artifact);
    for (const changed of [{ ...result, finalUrl: "https://other.example/" }, { ...result, finalUrl: "http://127.0.0.1" },
      { ...result, optimized: { ...artifact, publicUrl: "https://attacker.example/image.webp" } },
      { ...result, optimized: { ...artifact, objectKey: "indietools/sites/screenshots/image.webp" } },
      { ...result, retentionUntil: new Date(Date.now() - 1).toISOString() }, { ...result, optimized: { ...artifact, publicUrl: undefined } }]) {
      expect(() => validatePublicScreenshot(changed, "https://example.com")).toThrow();
    }
  });
});
