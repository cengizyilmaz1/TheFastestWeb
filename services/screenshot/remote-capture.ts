import sharp from "sharp";
import { z } from "zod";
import { parsePublicHttpUrl } from "../../src/lib/security/public-url";
import type { ScreenshotConfig } from "./config";
import type { PreparedCapture } from "./contracts";
import { CaptureError, type CapturedImages } from "./capture";

const responseSchema = z.object({ ok: z.literal(true), imageBase64: z.string().max(6 * 1024 * 1024), contentType: z.literal("image/jpeg"),
  width: z.number().int().min(1).max(1920), height: z.number().int().min(1).max(1200), finalUrl: z.string().max(2048), title: z.string().max(512) });

export async function rendererReady(config: ScreenshotConfig, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(new URL("/health", config.SCREENSHOT_RENDERER_URL), {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(2000), cache: "no-store",
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Screenshot renderer is unavailable");
}

/** Compatibility with the currently deployed IndieTools renderer. It supplies
 * desktop viewport JPEG only; unsupported modes must never be silently faked. */
export function createRemoteCapture(config: ScreenshotConfig, fetchImpl: typeof fetch = fetch) {
  return async (request: PreparedCapture): Promise<CapturedImages> => {
    if (request.device !== "desktop" || request.mode !== "viewport" || request.viewport.width !== 1440 || request.viewport.height !== 900) {
      throw new CaptureError("CAPTURE_FAILED");
    }
    const response = await fetchImpl(new URL("/capture", config.SCREENSHOT_RENDERER_URL), {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(35_000), headers: {
        authorization: `Bearer ${config.SCREENSHOT_RENDERER_TOKEN}`, "content-type": "application/json",
      }, body: JSON.stringify({ url: request.url }),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new CaptureError("CAPTURE_FAILED");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 6 * 1024 * 1024) throw new CaptureError("CAPTURE_TOO_LARGE");
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { reader.releaseLock(); }
    const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!response.ok) {
      const reason = raw && typeof raw === "object" && "reason" in raw ? raw.reason : undefined;
      throw new CaptureError(reason === "blocked" ? "URL_BLOCKED" : reason === "too-large" ? "CAPTURE_TOO_LARGE" : "CAPTURE_FAILED");
    }
    const payload = responseSchema.parse(raw), original = Buffer.from(payload.imageBase64, "base64");
    if (!original.length || original.length > 4 * 1024 * 1024) throw new CaptureError("CAPTURE_TOO_LARGE");
    const image = sharp(original, { limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== "jpeg" || metadata.width !== payload.width || metadata.height !== payload.height || payload.width !== 1440 || payload.height !== 900) throw new CaptureError("CAPTURE_FAILED");
    const optimized = await image.webp({ quality: 82, effort: 4 }).toBuffer();
    if (optimized.length > 6 * 1024 * 1024) throw new CaptureError("CAPTURE_TOO_LARGE");
    return { original, optimized, width: payload.width, height: payload.height, finalUrl: parsePublicHttpUrl(payload.finalUrl).href, title: payload.title };
  };
}
