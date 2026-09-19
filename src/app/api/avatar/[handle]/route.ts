import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/modules/security/rate-limit";

export const GET = withApi(async (_request, { params }: { params: Promise<{ handle: string }> }) => {
  const { handle } = await params;
  if (!/^[a-zA-Z0-9_]{1,15}$/.test(handle)) throw new AppError("NOT_FOUND", "Avatar not found.", 404);
  const key = getEnv().UNAVATAR_API_KEY;
  if (!key) throw new AppError("NOT_FOUND", "Avatar not available.", 404);
  await enforceRateLimit("avatar-global", "all", 1000, 3600);
  // Fixed provider origin; never forward its credential to a redirected origin.
  const response = await fetch(`https://unavatar.io/x/${encodeURIComponent(handle)}`, {
    headers: { "x-api-key": key }, redirect: "error", signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  const type = response.headers.get("content-type")?.split(";")[0] || "";
  if (!response.ok || !["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(type)) {
    await response.body?.cancel();
    throw new AppError("NOT_FOUND", "Avatar not found.", 404);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("NOT_FOUND", "Avatar not found.", 404);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new AppError("UPSTREAM_UNAVAILABLE", "Avatar is too large.", 502);
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  return new NextResponse(Buffer.concat(chunks), { headers: {
    "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff",
  } });
});
