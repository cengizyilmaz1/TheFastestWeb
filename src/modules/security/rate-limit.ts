import { consumeRateLimit } from "@/infrastructure/queue/redis";
import { AppError } from "@/lib/http/errors";

/** Shared atomic limits; unavailable Redis fails closed before provider work. */
export async function enforceRateLimit(scope: string, actor: string, limit: number, windowSeconds: number): Promise<void> {
  const result = await consumeRateLimit(scope, actor, limit, windowSeconds * 1000);
  if (!result.allowed) throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", 429);
}
