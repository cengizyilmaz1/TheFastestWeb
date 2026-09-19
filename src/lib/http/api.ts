import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { AppError } from "./errors";
import { CORRELATION_HEADER, correlationIdFrom, getCorrelationId, withCorrelationId } from "./correlation";

export function jsonError(error: unknown, correlationId = getCorrelationId()): NextResponse {
  const known = error instanceof AppError;
  const code = known ? error.code : "INTERNAL_ERROR";
  const status = known ? error.status : 500;
  logger[status >= 500 ? "error" : "warn"]({ event: "api.error", code, status, correlationId });
  return NextResponse.json({
    error: known ? error.message : "The request could not be completed.",
    code,
    correlationId,
  }, {
    status,
    headers: { "Cache-Control": "no-store", ...(correlationId ? { [CORRELATION_HEADER]: correlationId } : {}) },
  });
}

export function withApi<Context = unknown>(
  handler: (request: NextRequest, context: Context) => Response | Promise<Response>,
) {
  return async (request: NextRequest, context: Context): Promise<Response> => {
    const correlationId = correlationIdFrom(request.headers);
    return withCorrelationId(correlationId, async () => {
      const startedAt = performance.now();
      let response: Response;
      try {
        response = await handler(request, context);
      } catch (error) {
        response = jsonError(error, correlationId);
      }
      // Cloning also supports immutable responses returned by fetch().
      const headers = new Headers(response.headers);
      headers.set(CORRELATION_HEADER, correlationId);
      logger.info({ event: "api.request", method: request.method, status: response.status, durationMs: Math.round(performance.now() - startedAt) });
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    });
  };
}
