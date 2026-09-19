import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { withApi } from "./api";
import { AppError } from "./errors";
import { correlationIdFrom, getCorrelationId } from "./correlation";

describe("API error and correlation boundary", () => {
  it("keeps an accepted UUID correlation ID throughout async handling", async () => {
    const expected = "2a574ce1-565b-4205-92f7-8c79e641eb6d";
    const handler = withApi(async () => {
      await Promise.resolve();
      return Response.json({ correlationId: getCorrelationId() });
    });
    const response = await handler(new NextRequest("http://localhost/api/example", {
      headers: { "x-correlation-id": expected },
    }), undefined);
    expect(response.headers.get("x-correlation-id")).toBe(expected);
    expect(await response.json()).toEqual({ correlationId: expected });
    expect(getCorrelationId()).toBeUndefined();
  });

  it("replaces arbitrary user input in the correlation header", () => {
    const supplied = "person@example.test";
    expect(correlationIdFrom(new Headers({ "x-correlation-id": supplied }))).not.toBe(supplied);
  });

  it("does not expose raw database or provider exceptions", async () => {
    const handler = withApi(async () => { throw new Error("postgresql://app:password@database/test"); });
    const response = await handler(new NextRequest("http://localhost/api/example"), undefined);
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("password");
    expect(body.correlationId).toBe(response.headers.get("x-correlation-id"));
  });

  it("preserves deliberate public errors and status codes", async () => {
    const handler = withApi(async () => { throw new AppError("FEATURE_DISABLED", "Feature is unavailable.", 503); });
    const response = await handler(new NextRequest("http://localhost/api/example"), undefined);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "Feature is unavailable.", code: "FEATURE_DISABLED" });
  });
});
