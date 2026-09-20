import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createRemoteCapture, rendererReady } from "../../services/screenshot/remote-capture";
import { prepareCapture } from "../../services/screenshot/contracts";
import { screenshotConfig } from "./fixtures";

const config = screenshotConfig({ SCREENSHOT_CAPTURE_BACKEND: "remote", SCREENSHOT_RENDERER_URL: "http://renderer:4173",
  SCREENSHOT_RENDERER_TOKEN: `thefastestweb.${"d".repeat(64)}` });
const request = prepareCapture({ url: "https://example.com", visibility: "public" });

describe("shared IndieTools renderer compatibility", () => {
  it("uses the independent renderer credential and converts its bounded JPEG to stripped WebP", async () => {
    const original = await sharp({ create: { width: 1440, height: 900, channels: 3, background: "#eee" } })
      .withMetadata().jpeg().toBuffer();
    const transport = vi.fn<typeof fetch>(async () => Response.json({ ok: true, imageBase64: original.toString("base64"),
      contentType: "image/jpeg", width: 1440, height: 900, finalUrl: request.url, title: "Example" }));
    const result = await createRemoteCapture(config, transport)(request);
    const metadata = await sharp(result.optimized).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 1440, height: 900 });
    expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined();
    expect(result.original).toEqual(original);
    expect(transport).toHaveBeenCalledWith(new URL("http://renderer:4173/capture"), expect.objectContaining({
      redirect: "error", headers: { authorization: `Bearer ${config.SCREENSHOT_RENDERER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ url: request.url }),
    }));
  });

  it("refuses unavailable mobile profiles without calling the desktop renderer", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(createRemoteCapture(config, transport)(prepareCapture({ url: request.url, device: "mobile" })))
      .rejects.toMatchObject({ code: "CAPTURE_FAILED" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("preserves permanent upstream URL and size refusals instead of retrying unsafe captures", async () => {
    for (const [reason, code] of [["blocked", "URL_BLOCKED"], ["too-large", "CAPTURE_TOO_LARGE"], ["unavailable", "CAPTURE_FAILED"]]) {
      await expect(createRemoteCapture(config, async () => Response.json({ ok: false, reason }, { status: 422 }))(request))
        .rejects.toMatchObject({ code });
    }
  });

  it("checks the actual image dimensions rather than trusting renderer JSON", async () => {
    const small = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).jpeg().toBuffer();
    await expect(createRemoteCapture(config, async () => Response.json({ ok: true, imageBase64: small.toString("base64"),
      contentType: "image/jpeg", width: 1440, height: 900, finalUrl: request.url, title: "Example" }))(request))
      .rejects.toMatchObject({ code: "CAPTURE_FAILED" });
  });

  it("fails readiness when the shared renderer is unavailable", async () => {
    await expect(rendererReady(config, async () => new Response(null, { status: 503 }))).rejects.toThrow("unavailable");
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    await expect(rendererReady(config, transport)).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledWith(new URL("http://renderer:4173/health"), expect.objectContaining({ redirect: "error", cache: "no-store" }));
  });
});
