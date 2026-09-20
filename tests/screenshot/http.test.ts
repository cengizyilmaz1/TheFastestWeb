import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScreenshotServer } from "../../services/screenshot/http";
import type { ScreenshotRepository } from "../../services/screenshot/repository";
import type { ScreenshotBroker } from "../../services/screenshot/broker";
import { screenshotConfig, token } from "./fixtures";

let server: Server | undefined;
const create = vi.fn(), find = vi.fn(), present = vi.fn(), rateLimit = vi.fn(async () => true);
const imageReader = vi.fn(async () => ({ bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: "image/jpeg" as const }));
afterEach(async () => { await new Promise<void>((resolve) => { if (!server) return resolve(); server.close(() => resolve()); server.closeAllConnections(); }); vi.clearAllMocks(); });
async function start(config = screenshotConfig()) {
  rateLimit.mockResolvedValue(true); find.mockResolvedValue(null);
  server = createScreenshotServer(config, { create, find, present, ready: async () => undefined } as unknown as ScreenshotRepository,
    { rateLimit, ready: async () => undefined } as unknown as ScreenshotBroker, { isStopping: () => false, imageReader });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test address");
  return `http://127.0.0.1:${address.port}`;
}
const headers = { authorization: `Bearer thefastestweb.${token}`, "content-type": "application/json", "idempotency-key": randomUUID() };
describe("screenshot authenticated API", () => {
  it("requires authentication before creating or looking up jobs", async () => {
    const base = await start();
    expect((await fetch(`${base}/v1/captures`, { method: "POST", body: "{}" })).status).toBe(401);
    expect(create).not.toHaveBeenCalled(); expect(find).not.toHaveBeenCalled();
  });
  it("binds cache and image access to the authenticated client", async () => {
    const base = await start(), id = randomUUID();
    expect((await fetch(`${base}/v1/captures/${id}/image`, { headers })).status).toBe(404);
    expect(find).toHaveBeenCalledWith("thefastestweb", id);
  });
  it("reads new originals privately and preserves legacy artifact locations", async () => {
    const base = await start(), id = randomUUID(), objectKey = "thefastestweb/sites/screenshots/desktop/original.jpg";
    find.mockResolvedValue({ request: { visibility: "public" } });
    present.mockReturnValue({ id, status: "ready", result: { original: { objectKey, visibility: "private" } } });
    const response = await fetch(`${base}/v1/captures/${id}/image`, { headers });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(imageReader).toHaveBeenLastCalledWith(objectKey, { visibility: "private", maxBytes: 6 * 1024 * 1024 });
    present.mockReturnValue({ id, status: "ready", result: { original: { objectKey } } });
    expect((await fetch(`${base}/v1/captures/${id}/image`, { headers })).status).toBe(200);
    expect(imageReader).toHaveBeenLastCalledWith(objectKey, { visibility: "public", maxBytes: 6 * 1024 * 1024 });
  });
  it("rejects private destinations, unbounded bodies, absent idempotency, and public drafts", async () => {
    const base = await start();
    expect((await fetch(`${base}/v1/captures`, { method: "POST", headers, body: JSON.stringify({ url: "http://127.0.0.1" }) })).status).toBe(400);
    expect((await fetch(`${base}/v1/captures`, { method: "POST", headers, body: "x".repeat(9000) })).status).toBe(413);
    expect((await fetch(`${base}/v1/captures`, { method: "POST", headers: { authorization: headers.authorization, "content-type": "application/json" }, body: "{}" })).status).toBe(400);
    expect((await fetch(`${base}/v1/captures`, { method: "POST", headers: { ...headers, authorization: `Bearer indietools.${"b".repeat(64)}` }, body: JSON.stringify({ url: "https://example.com", visibility: "public" }) })).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it("reports unavailable profiles instead of claiming legacy renderer mobile support", async () => {
    const base = await start(screenshotConfig({ SCREENSHOT_CAPTURE_BACKEND: "remote", SCREENSHOT_RENDERER_URL: "http://renderer:3100", SCREENSHOT_RENDERER_TOKEN: token }));
    const response = await fetch(`${base}/v1/captures`, { method: "POST", headers, body: JSON.stringify({ url: "https://example.com", device: "mobile" }) });
    expect(response.status).toBe(422); expect(create).not.toHaveBeenCalled();
  });
  it("returns only a receipt until rendering finishes and fails closed when rate limited", async () => {
    const base = await start();
    create.mockResolvedValue({ id: randomUUID(), status: "pending" });
    const response = await fetch(`${base}/v1/captures`, { method: "POST", headers, body: JSON.stringify({ url: "https://example.com" }) });
    expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ status: "pending" });
    rateLimit.mockResolvedValue(false);
    expect((await fetch(`${base}/v1/captures/${randomUUID()}`, { headers })).status).toBe(429);
  });
});
