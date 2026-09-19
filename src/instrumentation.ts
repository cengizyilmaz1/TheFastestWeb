import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { registerRuntime } = await import("@/config/register-runtime");
    registerRuntime();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (_error, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@/infrastructure/logging/logger");
    const { correlationIdFrom, CORRELATION_HEADER } = await import("@/lib/http/correlation");
    const incomingId = request.headers[CORRELATION_HEADER];
    const headers = new Headers();
    if (typeof incomingId === "string") headers.set(CORRELATION_HEADER, incomingId);
    // Route template is safe; request path/query/error text may contain PII.
    logger.error({ event: "render.error", route: context.routePath, routeType: context.routeType, correlationId: correlationIdFrom(headers) });
  }
};
