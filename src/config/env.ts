import { z } from "zod";

export const DEFAULT_SITE_URL = "https://thefastestweb.site";

const optionalString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);
const flag = z.preprocess(
  (value) => value === "" || value === undefined ? "false" : value,
  z.enum(["true", "false"]).transform((value) => value === "true"),
);
const origin = z.url().refine((value) => {
  const parsed = new URL(value);
  return ["http:", "https:"].includes(parsed.protocol)
    && !parsed.username && !parsed.password
    && parsed.pathname === "/" && !parsed.search && !parsed.hash;
}, "Must be an HTTP(S) origin without credentials, path or query")
  .transform((value) => new URL(value).origin);
const optionalOrigin = z.preprocess((value) => value === "" ? undefined : value, origin.optional());
const positiveInteger = (fallback: number, maximum: number) => z.preprocess(
  (value) => value === "" || value === undefined ? fallback : value,
  z.coerce.number().int().min(1).max(maximum),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEPLOYMENT_MODE: z.enum(["production", "demo"]).default("production"),
  SITE_URL: z.preprocess((value) => value === "" || value === undefined ? DEFAULT_SITE_URL : value, origin),
  DATABASE_URL: optionalString.refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return ["postgres:", "postgresql:"].includes(parsed.protocol)
        && Boolean(parsed.hostname) && parsed.pathname.length > 1 && !parsed.hash;
    } catch {
      return false;
    }
  }, "Must be a PostgreSQL connection string"),
  DB_MAX_CONNECTIONS: positiveInteger(10, 100),
  DB_CONNECT_TIMEOUT_SECONDS: positiveInteger(10, 120),
  DB_IDLE_TIMEOUT_SECONDS: positiveInteger(20, 600),
  DB_STATEMENT_TIMEOUT_MS: positiveInteger(10000, 300000),
  REDIS_URL: optionalString.refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      decodeURIComponent(parsed.password);
      return ["redis:", "rediss:"].includes(parsed.protocol)
        && Boolean(parsed.hostname) && !parsed.search && !parsed.hash
        && /^\/(?:[0-9]|1[0-5])?$/.test(parsed.pathname || "/");
    } catch {
      return false;
    }
  }, "Must be a Redis connection string with a database index from 0 to 15"),
  QUEUE_PREFIX: z.preprocess((value) => value === "" || value === undefined ? "tfw" : value,
    z.string().regex(/^[a-zA-Z0-9-]{1,40}$/)),
  WORKER_CONCURRENCY: positiveInteger(2, 8),
  PSI_REQUESTS_PER_MINUTE: positiveInteger(10, 120),
  PSI_REQUESTS_PER_DAY: positiveInteger(1000, 100000),
  SCHEDULER_ENABLED: flag,
  SCHEDULER_INTERVAL_SECONDS: positiveInteger(60, 300),
  JOB_MAX_ATTEMPTS: positiveInteger(3, 10),
  WORKER_HEALTH_PORT: positiveInteger(3001, 65535),
  SCHEDULER_HEALTH_PORT: positiveInteger(3002, 65535),
  AUTH_SECRET: optionalString.refine((value) => !value || value.length >= 32, "Must contain at least 32 characters"),
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  AUTH_URL: optionalOrigin,
  AUTH_TRUST_HOST: flag,
  GOOGLE_PSI_API_KEY: optionalString,
  GOOGLE_PSI_API_KEY_BACKUP: optionalString,
  CRON_SECRET: optionalString.refine((value) => !value || value.length >= 32, "Must contain at least 32 characters"),
  CHROMIUM_EXECUTABLE_PATH: optionalString,
  UNAVATAR_API_KEY: optionalString,
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  SITE_NAME: z.string().min(1).max(80).default("TheFastestWeb"),
  SITE_EMAIL: optionalString.refine((value) => !value || z.email().safeParse(value).success, "Must be an email address"),
  INDIETOOLS_URL: optionalString.refine((value) => { if (!value) return true; try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } }, "Must be an HTTPS URL without credentials"),
  PAYMENTS_ENABLED: flag,
  DODO_API_KEY: optionalString,
  DODO_WEBHOOK_SECRET: optionalString,
  DODO_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"),
  EMAIL_ENABLED: flag,
  M365_TENANT_ID: optionalString.refine((value) => !value || z.uuid().safeParse(value).success, "Must be a tenant UUID"),
  M365_CLIENT_ID: optionalString.refine((value) => !value || z.uuid().safeParse(value).success, "Must be an app UUID"),
  M365_CLIENT_SECRET: optionalString,
  M365_SENDER: optionalString.refine((value) => !value || z.email().safeParse(value).success, "Must be an email address"),
  EMAIL_UNSUBSCRIBE_SECRET: optionalString.refine((value) => !value || value.length >= 32, "Must contain at least 32 characters"),
  STORAGE_ENABLED: flag,
  R2_ACCOUNT_ID: optionalString.refine((value) => !value || /^[a-f0-9]{32}$/i.test(value), "Must be a Cloudflare account ID"),
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString.refine((value) => !value || /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value), "Must be a bucket name"),
  R2_PRIVATE_BUCKET: optionalString.refine((value) => !value || /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value), "Must be a bucket name"),
  R2_PUBLIC_BASE_URL: optionalOrigin.refine((value) => !value || value.startsWith("https://"), "Must use HTTPS"),
  ANALYTICS_ENABLED: flag,
  GA_MEASUREMENT_ID: optionalString.refine((value) => !value || /^G-[A-Z0-9]{4,20}$/.test(value), "Must be a GA measurement ID"),
  DATAFAST_WEBSITE_ID: optionalString.refine((value) => !value || /^[a-zA-Z0-9_-]{1,100}$/.test(value), "Invalid website ID"),
  DATAFAST_DOMAIN: optionalString.refine((value) => !value || /^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$/i.test(value), "Must be a hostname"),
  DATAFAST_API_KEY: optionalString,
  DATAFAST_BOT_TRACKING_ENABLED: flag,
  DATAFAST_BOT_TOKEN: optionalString.refine((value) => !value || /^dfbot_[a-zA-Z0-9_-]{16,256}$/.test(value), "Must be a website bot token"),
  DATAFAST_BOT_TRUSTED_IP_HEADER: z.enum(["none", "x-real-ip", "cf-connecting-ip", "x-forwarded-for"]).default("none"),
  SCREENSHOTS_ENABLED: flag,
  SCREENSHOT_CLIENT_ID: z.string().regex(/^[a-z0-9-]{1,40}$/).default("thefastestweb"),
  SCREENSHOT_SERVICE_URL: optionalOrigin,
  SCREENSHOT_SERVICE_TOKEN: optionalString.refine((value) => !value || /^[a-f0-9]{64}$/i.test(value), "Must be a 64-character hexadecimal token"),
  SEARCH_CONSOLE_VERIFICATION: optionalString,
  BING_VERIFICATION: optionalString,
  INDEXNOW_KEY: optionalString.refine((value) => !value || /^[a-zA-Z0-9-]{8,128}$/.test(value), "Invalid IndexNow key"),
});

export type Env = z.infer<typeof envSchema>;
export type RuntimeRole = "web" | "worker" | "scheduler";

export class EnvironmentError extends Error {
  readonly code = "CONFIGURATION_INVALID";
  constructor(readonly fields: readonly string[]) {
    // Never include values or the raw Zod error, which may contain credentials.
    super(`Invalid environment configuration: ${fields.join(", ")}`);
    this.name = "EnvironmentError";
  }
}

export function parseEnv(
  raw: Record<string, string | undefined>,
  options: { requireProductionSecrets?: boolean; role?: RuntimeRole } = {},
): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvironmentError([...new Set(result.error.issues.map((issue) => issue.path.join(".")))]);
  }
  const config = result.data;
  const missing: string[] = [];
  if (options.requireProductionSecrets && config.NODE_ENV === "production") {
    for (const key of ["DATABASE_URL", "REDIS_URL"] as const) {
      if (!config[key]) missing.push(key);
    }
    if (config.REDIS_URL && decodeURIComponent(new URL(config.REDIS_URL).password).length < 32) missing.push("REDIS_URL");
    if (!options.role || options.role === "web") {
      for (const key of ["AUTH_SECRET", ...(config.DEPLOYMENT_MODE === "demo" ? [] : ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"])] as const) {
        if (!config[key as keyof Env]) missing.push(key);
      }
      if (!config.SITE_URL.startsWith("https://")) missing.push("SITE_URL");
      if (config.AUTH_URL && !config.AUTH_URL.startsWith("https://")) missing.push("AUTH_URL");
      if (config.AUTH_URL && new URL(config.AUTH_URL).origin !== new URL(config.SITE_URL).origin) missing.push("AUTH_URL");
      if (!config.AUTH_TRUST_HOST) missing.push("AUTH_TRUST_HOST");
    }
  }
  const requireFields = (enabled: boolean, keys: (keyof Env)[]) => {
    if (enabled) for (const key of keys) if (!config[key]) missing.push(key);
  };
  requireFields(config.PAYMENTS_ENABLED, ["DODO_API_KEY", "DODO_WEBHOOK_SECRET"]);
  requireFields(config.EMAIL_ENABLED, ["M365_TENANT_ID", "M365_CLIENT_ID", "M365_CLIENT_SECRET", "M365_SENDER", "EMAIL_UNSUBSCRIBE_SECRET"]);
  requireFields(config.STORAGE_ENABLED, ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PRIVATE_BUCKET"]);
  if (config.R2_BUCKET && config.R2_BUCKET === config.R2_PRIVATE_BUCKET) missing.push("R2_PRIVATE_BUCKET");
  requireFields(config.SCREENSHOTS_ENABLED, ["SCREENSHOT_SERVICE_URL", "SCREENSHOT_SERVICE_TOKEN"]);
  if (config.ANALYTICS_ENABLED && !config.GA_MEASUREMENT_ID && !config.DATAFAST_WEBSITE_ID) missing.push("GA_MEASUREMENT_ID", "DATAFAST_WEBSITE_ID");
  if (config.DATAFAST_WEBSITE_ID && !config.DATAFAST_DOMAIN) missing.push("DATAFAST_DOMAIN");
  requireFields(config.DATAFAST_BOT_TRACKING_ENABLED, ["DATAFAST_WEBSITE_ID", "DATAFAST_DOMAIN"]);
  if ((config.ANALYTICS_ENABLED || config.DATAFAST_BOT_TRACKING_ENABLED) && config.DATAFAST_DOMAIN
    && config.DATAFAST_DOMAIN.toLowerCase() !== new URL(config.SITE_URL).hostname) missing.push("DATAFAST_DOMAIN");
  if (config.DEPLOYMENT_MODE === "demo") {
    for (const key of ["PAYMENTS_ENABLED", "EMAIL_ENABLED", "ANALYTICS_ENABLED", "DATAFAST_BOT_TRACKING_ENABLED", "SCHEDULER_ENABLED"] as const) {
      if (config[key]) missing.push(key);
    }
  }
  if (missing.length) throw new EnvironmentError([...new Set(missing)]);
  return Object.freeze(config);
}

let cached: Env | undefined;

/** Import/build safe: absence of runtime credentials is checked only at startup. */
export function getEnv(): Env {
  return cached ??= parseEnv(process.env);
}

/** Called by instrumentation before a production instance handles requests. */
export function validateRuntimeEnv(role: RuntimeRole = "web"): Env {
  cached = parseEnv(process.env, { requireProductionSecrets: true, role });
  return cached;
}
