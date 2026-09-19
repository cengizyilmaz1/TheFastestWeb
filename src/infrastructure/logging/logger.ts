import pino from "pino";
import { getCorrelationId } from "@/lib/http/correlation";

const sensitiveKeys = /^(?:authorization|cookie|set-cookie|password|secret|token|accessToken|refreshToken|apiKey|database_url|redis_url|auth_secret|auth_google_secret|email|ip|userAgent|user_agent|headers|body|url|connectionString|name|username|twitterHandle|referrer|avatarUrl)$/i;
const secretEnvironmentKeys = [
  "DATABASE_URL", "REDIS_URL", "REDIS_PASSWORD", "AUTH_SECRET", "NEXTAUTH_SECRET", "AUTH_GOOGLE_SECRET",
  "GOOGLE_PSI_API_KEY", "GOOGLE_PSI_API_KEY_BACKUP", "CRON_SECRET",
  "UNAVATAR_API_KEY", "DODO_API_KEY", "DODO_WEBHOOK_SECRET", "M365_CLIENT_SECRET",
  "EMAIL_UNSUBSCRIBE_SECRET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "DATAFAST_API_KEY", "SCREENSHOT_SERVICE_TOKEN",
] as const;

/** Keep diagnostic shape while removing credentials, PII, and raw Error text. */
export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value instanceof Error) return { type: value.name };
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeLogValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeys.test(key) || /(?:secret|password|token|api[-_]?key|email|name|phone|address)/i.test(key)
        ? "[REDACTED]"
        : sanitizeLogValue(item, depth + 1),
    ]));
  }
  if (typeof value === "string") {
    let sanitized = value;
    for (const key of secretEnvironmentKeys) {
      const secret = process.env[key];
      if (secret && secret.length >= 6) sanitized = sanitized.split(secret).join("[REDACTED_SECRET]");
    }
    return sanitized
      .replace(/(?:postgres(?:ql)?|rediss?|https?):\/\/\S+/gi, "[REDACTED_URL]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]")
      .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:AIza[\w-]{20,}|(?:re_|ghp_|github_pat_|polar_oat_|whsec_)[\w+/=-]{15,})/g, "[REDACTED_SECRET]");
  }
  return value;
}

const validLevels = new Set(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);

export const logger = pino({
  level: validLevels.has(process.env.LOG_LEVEL ?? "") ? process.env.LOG_LEVEL : "info",
  base: { service: "thefastestweb" },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: () => ({ correlationId: getCorrelationId() }),
  hooks: {
    logMethod(args, method) {
      const safeArgs = args.map((arg) => sanitizeLogValue(arg));
      method.apply(this, safeArgs as Parameters<typeof method>);
    },
  },
  redact: {
    paths: ["req", "res", "headers", "body", "email", "password", "token", "secret", "DATABASE_URL", "REDIS_URL", "REDIS_PASSWORD", "AUTH_SECRET"],
    censor: "[REDACTED]",
  },
});
