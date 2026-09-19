export const ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  URL_BLOCKED: "URL_BLOCKED",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  FEATURE_DISABLED: "FEATURE_DISABLED",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/** Message is deliberately public. Never pass provider/database error messages. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}
