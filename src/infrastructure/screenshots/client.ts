import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { z } from "zod";
import { prepareCapture, type CaptureRequest } from "../../../services/screenshot/contracts";

const artifact = z.object({ objectKey: z.string().max(512), publicUrl: z.url().optional(), width: z.number().int().min(1).max(10000), height: z.number().int().min(1).max(8000),
  contentType: z.enum(["image/jpeg", "image/webp"]), size: z.number().int().min(1).max(6 * 1024 * 1024), hash: z.string().regex(/^[a-f0-9]{64}$/) });
export const screenshotResponseSchema = z.object({ id: z.uuid(), status: z.enum(["pending", "processing", "ready", "failed", "expired"]),
  result: z.object({ optimized: artifact, original: artifact, finalUrl: z.url(), title: z.string().max(512), capturedAt: z.iso.datetime(), retentionUntil: z.iso.datetime() }).optional(), errorCode: z.string().max(64).optional() });
export type ScreenshotResponse = z.infer<typeof screenshotResponseSchema>;

async function request(path: string, options: { body?: string; idempotencyKey?: string } = {}): Promise<ScreenshotResponse> {
  const env = getEnv();
  if (!env.SCREENSHOTS_ENABLED || !env.SCREENSHOT_SERVICE_URL || !env.SCREENSHOT_SERVICE_TOKEN || !/^[a-f0-9]{64}$/.test(env.SCREENSHOT_SERVICE_TOKEN)) {
    throw new AppError("FEATURE_DISABLED", "Screenshot capture is not configured.", 503);
  }
  let response: Response;
  try { response = await fetch(new URL(path, env.SCREENSHOT_SERVICE_URL), { method: options.body ? "POST" : "GET", redirect: "error",
    cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${env.SCREENSHOT_CLIENT_ID}.${env.SCREENSHOT_SERVICE_TOKEN}`,
      ...(options.body ? { "content-type": "application/json", "idempotency-key": options.idempotencyKey! } : {}) }, body: options.body }); }
  catch { throw new AppError("UPSTREAM_UNAVAILABLE", "Screenshot service is temporarily unavailable.", 503); }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("UPSTREAM_UNAVAILABLE", "Screenshot service is unavailable.", 503);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
      if (size > 65536) throw new Error("Response limit"); chunks.push(value); }
    if (!response.ok) throw new Error("Capture service rejected request");
    return screenshotResponseSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { await reader.cancel().catch(() => undefined); throw new AppError("UPSTREAM_UNAVAILABLE", "Screenshot service is temporarily unavailable.", 503); }
  finally { reader.releaseLock(); }
}
export async function requestScreenshot(input: CaptureRequest, idempotencyKey: string) {
  if (!z.uuid().safeParse(idempotencyKey).success) throw new AppError("INVALID_REQUEST", "Invalid screenshot request ID.", 400);
  return request("/v1/captures", { body: JSON.stringify(prepareCapture(input)), idempotencyKey });
}
export async function getScreenshot(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("INVALID_REQUEST", "Invalid screenshot ID.", 400);
  return request(`/v1/captures/${id}`);
}
