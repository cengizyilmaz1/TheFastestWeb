import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { AppError } from "@/lib/http/errors";

/** Durable atomic interim adapter; Redis takes over in milestone 2. No raw IP is stored. */
export async function enforceRateLimit(scope: string, actor: string, limit: number, windowSeconds: number): Promise<void> {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "This service is temporarily unavailable.", 503);
  const key = createHash("sha256").update(`${scope}\0${actor}`).digest("hex");
  const rows = await db.execute<{ count: number }>(sql`
    INSERT INTO request_rate_limits (key, window_started_at, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN request_rate_limits.window_started_at <= now() - (${windowSeconds} * interval '1 second')
        THEN 1 ELSE LEAST(request_rate_limits.count + 1, ${limit + 1}) END,
      window_started_at = CASE WHEN request_rate_limits.window_started_at <= now() - (${windowSeconds} * interval '1 second')
        THEN now() ELSE request_rate_limits.window_started_at END
    RETURNING count`);
  if (rows[0].count > limit) throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", 429);
}
