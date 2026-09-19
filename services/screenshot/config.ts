import { z } from "zod";

const integer = (fallback: number, max: number) => z.preprocess((value) => value === "" || value === undefined ? fallback : value, z.coerce.number().int().min(1).max(max));
const clientSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  namespace: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  requestsPerMinute: z.number().int().min(1).max(120).default(10),
  requestsPerDay: z.number().int().min(1).max(10000).default(250),
  allowPublic: z.boolean().default(false),
}).strict();
export type ScreenshotClient = z.infer<typeof clientSchema>;
const configSchema = z.object({
  SCREENSHOT_DATABASE_URL: z.string().url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol)),
  SCREENSHOT_REDIS_URL: z.string().url().refine((value) => ["redis:", "rediss:"].includes(new URL(value).protocol) && decodeURIComponent(new URL(value).password).length >= 32),
  SCREENSHOT_QUEUE_PREFIX: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/).default("central-screenshot"),
  SCREENSHOT_PORT: integer(3100, 65535),
  SCREENSHOT_WORKER_PORT: integer(3101, 65535),
  SCREENSHOT_CONCURRENCY: integer(2, 4),
  SCREENSHOT_CACHE_HOURS: integer(6, 168),
  SCREENSHOT_RETENTION_DAYS: integer(7, 365),
  SCREENSHOT_HISTORY_DAILY_DAYS: integer(30, 365),
  SCREENSHOT_HISTORY_WEEKLY_DAYS: integer(180, 1095),
  SCREENSHOT_HISTORY_MONTHLY_DAYS: integer(1095, 3650),
  CHROMIUM_EXECUTABLE_PATH: z.string().min(1).default("/opt/chrome/chrome-linux64/chrome"),
  SCREENSHOT_CAPTURE_BACKEND: z.enum(["remote", "local"]).default("remote"),
  SCREENSHOT_RENDERER_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  SCREENSHOT_RENDERER_TOKEN: z.preprocess((value) => value === "" ? undefined : value, z.string().min(32).optional()),
  clients: z.array(clientSchema).min(1).max(100),
});
export type ScreenshotConfig = z.infer<typeof configSchema>;
export function parseScreenshotConfig(raw: Record<string, string | undefined>): ScreenshotConfig {
  let clients: unknown;
  try { clients = JSON.parse(raw.SCREENSHOT_CLIENTS_JSON ?? "null"); } catch { throw new Error("Invalid SCREENSHOT_CLIENTS_JSON"); }
  const parsed = configSchema.safeParse({ ...raw, clients });
  if (!parsed.success) throw new Error(`Invalid screenshot configuration fields: ${[...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(", ")}`);
  if (new Set(parsed.data.clients.map((client) => client.id)).size !== parsed.data.clients.length ||
      new Set(parsed.data.clients.map((client) => client.namespace)).size !== parsed.data.clients.length) throw new Error("Screenshot clients and namespaces must be unique");
  if (parsed.data.SCREENSHOT_CAPTURE_BACKEND === "remote") {
    if (!parsed.data.SCREENSHOT_RENDERER_URL || !parsed.data.SCREENSHOT_RENDERER_TOKEN) throw new Error("Remote screenshot renderer configuration is required");
    const url = new URL(parsed.data.SCREENSHOT_RENDERER_URL);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Screenshot renderer URL must be a trusted HTTP(S) origin");
  }
  return parsed.data;
}
export function retentionDays(config: ScreenshotConfig, history: "none" | "daily" | "weekly" | "monthly"): number {
  return history === "daily" ? config.SCREENSHOT_HISTORY_DAILY_DAYS : history === "weekly" ? config.SCREENSHOT_HISTORY_WEEKLY_DAYS :
    history === "monthly" ? config.SCREENSHOT_HISTORY_MONTHLY_DAYS : config.SCREENSHOT_RETENTION_DAYS;
}
