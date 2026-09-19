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
  ENABLE_LEGACY_RESEND: flag,
  RESEND_API_KEY: optionalString,
});

export type Env = z.infer<typeof envSchema>;

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
  options: { requireProductionSecrets?: boolean } = {},
): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvironmentError([...new Set(result.error.issues.map((issue) => issue.path.join(".")))]);
  }
  const config = result.data;
  const missing: string[] = [];
  if (options.requireProductionSecrets && config.NODE_ENV === "production") {
    for (const key of ["DATABASE_URL", "AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"] as const) {
      if (!config[key]) missing.push(key);
    }
    if (!config.SITE_URL.startsWith("https://")) missing.push("SITE_URL");
    if (config.AUTH_URL && !config.AUTH_URL.startsWith("https://")) missing.push("AUTH_URL");
    if (config.AUTH_URL && new URL(config.AUTH_URL).origin !== new URL(config.SITE_URL).origin) missing.push("AUTH_URL");
    if (!config.AUTH_TRUST_HOST) missing.push("AUTH_TRUST_HOST");
  }
  if (config.ENABLE_LEGACY_RESEND && !config.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (missing.length) throw new EnvironmentError([...new Set(missing)]);
  return Object.freeze(config);
}

let cached: Env | undefined;

/** Import/build safe: absence of runtime credentials is checked only at startup. */
export function getEnv(): Env {
  return cached ??= parseEnv(process.env);
}

/** Called by instrumentation before a production instance handles requests. */
export function validateRuntimeEnv(): Env {
  cached = parseEnv(process.env, { requireProductionSecrets: true });
  return cached;
}
