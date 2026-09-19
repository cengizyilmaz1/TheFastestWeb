import { describe, expect, it } from "vitest";
import { authenticateClient } from "../../services/screenshot/auth";
import { prepareCapture, captureCacheKey } from "../../services/screenshot/contracts";
import { parseScreenshotConfig } from "../../services/screenshot/config";
import { screenshotConfig, token } from "./fixtures";

describe("central screenshot boundary", () => {
  it("authenticates only the intended client with a hashed key", () => {
    const { clients } = screenshotConfig();
    expect(authenticateClient(`Bearer thefastestweb.${token}`, clients)?.id).toBe("thefastestweb");
    for (const header of [undefined, `Bearer indietools.${token}`, `Bearer unknown.${token}`, `Bearer thefastestweb.${"b".repeat(64)}`, "Bearer " + "x".repeat(500)]) {
      expect(authenticateClient(header, clients)).toBeNull();
    }
  });
  it("defaults drafts to private and permits only bounded capture profiles", () => {
    expect(prepareCapture({ url: "https://EXAMPLE.COM#fragment" })).toMatchObject({ url: "https://example.com/", visibility: "private", viewport: { width: 1440, height: 900 } });
    expect(prepareCapture({ url: "https://example.com", device: "mobile" }).viewport).toEqual({ width: 390, height: 844 });
    for (const input of [{ url: "http://127.0.0.1" }, { url: "http://169.254.169.254" }, { url: "https://example.com", namespace: "other" },
      { url: "https://example.com", viewport: { width: 99999, height: 900 } }]) expect(() => prepareCapture(input)).toThrow();
  });
  it("separates client, viewport, privacy, device, transport, and history cache identities", () => {
    const request = prepareCapture({ url: "https://example.com" }), now = new Date("2026-09-19T12:00:00Z");
    const base = captureCacheKey("thefastestweb", request, now);
    for (const alternate of [prepareCapture({ url: "http://example.com" }), prepareCapture({ url: "https://www.example.com" }),
      prepareCapture({ url: "https://example.com", visibility: "public" }), prepareCapture({ url: "https://example.com", device: "mobile" }),
      prepareCapture({ url: "https://example.com", mode: "fullpage" })]) expect(captureCacheKey("thefastestweb", alternate, now)).not.toBe(base);
    expect(captureCacheKey("indietools", request, now)).not.toBe(base);
    const weekly = prepareCapture({ url: "https://example.com", history: "weekly" });
    expect(captureCacheKey("thefastestweb", weekly, now)).toBe(captureCacheKey("thefastestweb", weekly, new Date("2026-09-20T23:59:59Z")));
    expect(captureCacheKey("thefastestweb", weekly, now)).not.toBe(captureCacheKey("thefastestweb", weekly, new Date("2026-09-21T00:00:00Z")));
  });
  it("rejects ambiguous namespaces and redacts invalid configuration values", () => {
    const config = screenshotConfig();
    expect(() => screenshotConfig({ SCREENSHOT_CLIENTS_JSON: JSON.stringify([config.clients[0], { ...config.clients[1], namespace: config.clients[0].namespace }]) })).toThrow("unique");
    expect(() => parseScreenshotConfig({ SCREENSHOT_DATABASE_URL: "private-secret-value" })).toThrow();
    try { screenshotConfig({ SCREENSHOT_DATABASE_URL: "private-secret-value" }); } catch (error) { expect(String(error)).not.toContain("private-secret-value"); }
    expect(() => screenshotConfig({ SCREENSHOT_CAPTURE_BACKEND: "remote", SCREENSHOT_RENDERER_URL: "https://user:secret@example.com", SCREENSHOT_RENDERER_TOKEN: token })).toThrow("origin");
  });
});
