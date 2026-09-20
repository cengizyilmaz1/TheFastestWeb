import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizePublicUrl } from "../../src/lib/security/public-url";

export const CAPTURE_VERSION = "capture-v2-private-original";
export const captureRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  mode: z.enum(["viewport", "fullpage"]).default("viewport"),
  viewport: z.object({ width: z.number().int().min(320).max(1920), height: z.number().int().min(320).max(1200) }).strict().optional(),
  history: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  visibility: z.enum(["private", "public"]).default("private"),
}).strict();
export type CaptureRequest = z.input<typeof captureRequestSchema>;
export type PreparedCapture = z.output<typeof captureRequestSchema> & { viewport: { width: number; height: number } };
export type ImageArtifact = { objectKey: string; publicUrl?: string; visibility?: "private" | "public"; width: number; height: number; contentType: "image/jpeg" | "image/webp"; size: number; hash: string };
export type CaptureResult = {
  optimized: ImageArtifact; original: ImageArtifact;
  finalUrl: string; title: string; capturedAt: string; retentionUntil: string;
};
export type CaptureStatus = "pending" | "processing" | "ready" | "failed" | "expired";
export type CaptureResponse = { id: string; status: CaptureStatus; result?: CaptureResult; errorCode?: string };

export function prepareCapture(input: unknown): PreparedCapture {
  const request = captureRequestSchema.parse(input);
  return { ...request, url: normalizePublicUrl(request.url), viewport: request.viewport ??
    (request.device === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }) };
}
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function requestHash(request: PreparedCapture): string { return hash(JSON.stringify(request)); }
export function captureCacheKey(clientId: string, request: PreparedCapture, now: Date): string {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (request.history === "weekly") utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  if (request.history === "monthly") utc.setUTCDate(1);
  const period = request.history === "none" ? "cache" : utc.toISOString().slice(0, 10);
  return hash(JSON.stringify([CAPTURE_VERSION, clientId, request, period]));
}
