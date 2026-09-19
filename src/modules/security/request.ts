import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/http/errors";
import { getEnv } from "@/config/env";

export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const actual = Buffer.from(header), expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const configuredOrigin = new URL(getEnv().AUTH_URL || getEnv().SITE_URL).origin;
  if (!origin || origin !== configuredOrigin) {
    if (getEnv().NODE_ENV === "production" || origin !== new URL(request.url).origin) {
      throw new AppError("FORBIDDEN", "This request origin is not allowed.", 403);
    }
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>, maxBytes = 16_384): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError("INVALID_REQUEST", "A JSON request body is required.", 415);
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AppError("INVALID_REQUEST", "Request body is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_REQUEST", "A request body is required.", 400);
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new AppError("INVALID_REQUEST", "Request body is too large.", 413);
      chunks.push(value);
    }
    const value = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!value.success) throw new AppError("INVALID_REQUEST", "Please check the submitted fields.", 400);
    return value.data;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AppError) throw error;
    throw new AppError("INVALID_REQUEST", "The request body is not valid JSON.", 400);
  } finally { reader.releaseLock(); }
}
