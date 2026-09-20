import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticateClient } from "./auth";
import { prepareCapture } from "./contracts";
import type { ScreenshotConfig } from "./config";
import type { ScreenshotBroker } from "./broker";
import { ServiceError, type ScreenshotRepository } from "./repository";
import { readObject } from "../../src/infrastructure/storage/r2";
import { UnsafeUrlError } from "../../src/lib/security/public-url";
import { logger } from "../../src/infrastructure/logging/logger";

async function body(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new ServiceError("JSON_REQUIRED", 415);
  if (Number(request.headers["content-length"]) > 8192) throw new ServiceError("BODY_TOO_LARGE", 413);
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > 8192) throw new ServiceError("BODY_TOO_LARGE", 413);
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ServiceError("INVALID_JSON", 400); }
}

export function createScreenshotServer(config: ScreenshotConfig, repository: ScreenshotRepository, broker: ScreenshotBroker,
  options: { isStopping: () => boolean; imageReader?: typeof readObject } = { isStopping: () => false }) {
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const correlationId = randomUUID();
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-correlation-id": correlationId });
      response.end(JSON.stringify(value));
    };
    void (async () => {
      const url = new URL(request.url ?? "/", "http://screenshot.local");
      if (request.method === "GET" && url.pathname === "/health/live") return send(options.isStopping() ? 503 : 200, { status: options.isStopping() ? "stopping" : "live" });
      if (options.isStopping()) throw new ServiceError("STOPPING", 503);
      if (request.method === "GET" && url.pathname === "/health/ready") {
        await Promise.all([repository.ready(), broker.ready()]);
        return send(200, { status: "ready" });
      }
      const client = authenticateClient(request.headers.authorization, config.clients);
      if (!client) throw new ServiceError("UNAUTHORIZED", 401);
      if (!await broker.rateLimit(`${client.id}-${request.method === "POST" ? "capture" : "read"}`, request.method === "POST" ? client.requestsPerMinute : 120)) throw new ServiceError("RATE_LIMITED", 429);
      if (request.method === "POST" && url.pathname === "/v1/captures") {
        const key = z.uuid().safeParse(request.headers["idempotency-key"]);
        if (!key.success) throw new ServiceError("IDEMPOTENCY_KEY_REQUIRED", 400);
        const prepared = prepareCapture(await body(request));
        if (prepared.visibility === "public" && !client.allowPublic) throw new ServiceError("PUBLIC_MEDIA_FORBIDDEN", 403);
        if (config.SCREENSHOT_CAPTURE_BACKEND === "remote" && (prepared.mode !== "viewport" || prepared.device !== "desktop" || prepared.viewport.width !== 1440 || prepared.viewport.height !== 900)) throw new ServiceError("CAPTURE_PROFILE_UNAVAILABLE", 422);
        const result = await repository.create(client, prepared, key.data);
        return send(result.status === "ready" ? 200 : 202, result);
      }
      const match = /^\/v1\/captures\/([0-9a-f-]{36})(\/image)?$/.exec(url.pathname);
      if (request.method !== "GET" || !match || !z.uuid().safeParse(match[1]).success) throw new ServiceError("NOT_FOUND", 404);
      const row = await repository.find(client.id, match[1]);
      if (!row) throw new ServiceError("NOT_FOUND", 404);
      const result = repository.present(row);
      if (!match[2]) return send(200, result);
      if (result.status !== "ready" || !result.result) throw new ServiceError("IMAGE_UNAVAILABLE", 409);
      // Earlier receipts stored both artifacts in the request's bucket. New
      // captures mark the original private without relocating historical keys.
      const image = await (options.imageReader ?? readObject)(result.result.original.objectKey,
        { visibility: result.result.original.visibility ?? row.request.visibility, maxBytes: 6 * 1024 * 1024 });
      if (image.contentType !== "image/jpeg") throw new ServiceError("INVALID_IMAGE", 502);
      response.writeHead(200, { "content-type": "image/jpeg", "content-length": image.bytes.length, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-correlation-id": correlationId });
      response.end(image.bytes);
    })().catch((error) => {
      const known = error instanceof ServiceError;
      const code = known ? error.code : error instanceof UnsafeUrlError ? "URL_BLOCKED" : error instanceof z.ZodError ? "INVALID_REQUEST" : "SERVICE_UNAVAILABLE";
      const status = known ? error.status : ["URL_BLOCKED", "INVALID_REQUEST"].includes(code) ? 400 : 503;
      logger[status >= 500 ? "error" : "warn"]({ event: "screenshot.request_failed", code, status, correlationId });
      if (!response.headersSent) send(status, { error: code, correlationId }); else response.destroy();
    });
  });
  server.headersTimeout = 5000; server.requestTimeout = 10_000; server.timeout = 20_000;
  server.maxConnections = 128;
  return server;
}
