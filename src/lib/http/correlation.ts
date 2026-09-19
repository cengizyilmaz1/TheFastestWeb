import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export const CORRELATION_HEADER = "x-correlation-id";
const context = new AsyncLocalStorage<{ correlationId: string }>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function correlationIdFrom(headers: Headers): string {
  const supplied = headers.get(CORRELATION_HEADER);
  return supplied && uuid.test(supplied) ? supplied : randomUUID();
}

export function getCorrelationId(): string | undefined {
  return context.getStore()?.correlationId;
}

export function withCorrelationId<T>(correlationId: string, operation: () => T): T {
  return context.run({ correlationId }, operation);
}
