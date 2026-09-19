import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import type { PreferenceCategory } from "./templates";

const payload = z.object({ userId: z.uuid(), category: z.enum(["performance", "weekly", "badge", "marketing"]), expires: z.number().int().positive() }).strict();
function secret() {
  const value = getEnv().EMAIL_UNSUBSCRIBE_SECRET;
  if (!value || value.length < 32) throw new AppError("FEATURE_DISABLED", "Email preferences are temporarily unavailable.", 503);
  return value;
}
export function createUnsubscribeToken(userId: string, category: PreferenceCategory): string {
  const body = Buffer.from(JSON.stringify(payload.parse({ userId, category, expires: Math.floor(Date.now() / 1000) + 180 * 86_400 }))).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
export function verifyUnsubscribeToken(token: string) {
  if (token.length > 1024 || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(token)) throw new AppError("INVALID_REQUEST", "This unsubscribe link is invalid or expired.", 400);
  const [body, signature] = token.split(".");
  const actual = Buffer.from(signature, "base64url"), expected = createHmac("sha256", secret()).update(body).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError("INVALID_REQUEST", "This unsubscribe link is invalid or expired.", 400);
  try {
    const parsed = payload.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (parsed.expires < Date.now() / 1000) throw new Error("Expired");
    return parsed;
  } catch { throw new AppError("INVALID_REQUEST", "This unsubscribe link is invalid or expired.", 400); }
}
