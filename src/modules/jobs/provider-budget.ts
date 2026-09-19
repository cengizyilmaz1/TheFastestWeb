import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getEnv } from "@/config/env";
import { consumeRateLimit } from "@/infrastructure/queue/redis";
import { AppError } from "@/lib/http/errors";

export class ProviderQuotaError extends AppError {
  constructor(readonly retryAfterMs: number) {
    super("RATE_LIMITED", "The measurement quota is currently full. Please try again later.", 429);
  }
}

/** Called for EVERY actual provider request, including the backup credential. */
export async function consumePageSpeedBudget(): Promise<void> {
  const env = getEnv();
  const minute = await consumeRateLimit("psi-provider", "all", env.PSI_REQUESTS_PER_MINUTE, 60_000);
  if (!minute.allowed) throw new ProviderQuotaError(minute.retryAfterMs);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Testing is temporarily unavailable.", 503);
  // Reserve before the request. Unknown provider cost after a crash is never refunded.
  const [row] = await db.execute<{ reserved: boolean; delay: number }>(sql`
    WITH reservation AS (
      INSERT INTO provider_usage(day,provider,used)
      VALUES ((now() AT TIME ZONE 'UTC')::date,'pagespeed',1)
      ON CONFLICT(day,provider) DO UPDATE SET used=provider_usage.used+1
      WHERE provider_usage.used < ${env.PSI_REQUESTS_PER_DAY}
      RETURNING used
    ) SELECT EXISTS(SELECT 1 FROM reservation) AS reserved,
      ceil(extract(epoch FROM
        (((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC') - now()) * 1000)::integer AS delay`);
  if (!row.reserved) throw new ProviderQuotaError(Math.max(Number(row.delay), 1000));
}
