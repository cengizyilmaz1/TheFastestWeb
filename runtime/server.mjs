import { createServer } from "node:http";
import { resolve } from "node:path";
import next from "next";
import { createShutdown } from "./shutdown.mjs";
import { EnvironmentError, validateRuntimeEnv } from "./env.mjs";
import {
  createLegacyRedirectConsumer,
  createBoundedCutoverLogger,
  cutoverLogFields,
  loadLegacyRedirectManifest,
  writeLegacyRedirectResponse,
} from "./legacy-redirects.mjs";

const log = (event, details = {}) => process.stdout.write(JSON.stringify({
  level: /failed|timeout|invalid_port/.test(event) ? 50 : 30,
  time: new Date().toISOString(), service: "thefastestweb", event, ...details,
}) + "\n");

process.env.NODE_ENV = "production";
globalThis.__thefastestwebManagedLifecycle = true;

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  log("runtime.invalid_port");
  process.exit(1);
}
const hostname = process.env.HOSTNAME || "0.0.0.0";
const app = next({ dev: false, dir: resolve(import.meta.dirname, ".."), hostname, port });

try {
  const env = validateRuntimeEnv();
  const redirectManifest = env.TFW_REDIRECT_CUTOVER_ENABLED
    ? await loadLegacyRedirectManifest({
        path: env.TFW_REDIRECT_MANIFEST_PATH,
        expectedDigest: env.TFW_REDIRECT_MANIFEST_DIGEST,
      })
    : null;
  const redirectCutover = redirectManifest
    ? createLegacyRedirectConsumer(redirectManifest)
    : null;
  const logRedirectDecision = redirectManifest
    ? createBoundedCutoverLogger(log)
    : null;
  if (redirectManifest) {
    log("redirect_cutover.ready", {
      manifest: redirectManifest.manifestDigest.slice(0, 16),
      routes: redirectManifest.rules.length,
      images: redirectManifest.badges.length,
    });
  }
  process.env.NEXTAUTH_URL = env.AUTH_URL ?? env.SITE_URL;
  process.env.NEXTAUTH_SECRET = env.AUTH_SECRET;
  // The standalone artifact includes a normal generated next.config.js.
  // Only documented next() APIs are used; Next's private signal hooks are untouched.
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = createServer((request, response) => {
    if (globalThis.__thefastestwebStopping) {
      response.writeHead(503, { "Cache-Control": "no-store", Connection: "close" });
      response.end("Service is stopping.");
      return;
    }
    if (redirectCutover) {
      const decision = redirectCutover.resolve(request.url || "/");
      if (decision.type !== "pass") {
        logRedirectDecision(cutoverLogFields(decision, redirectManifest.manifestDigest));
        writeLegacyRedirectResponse(request, response, decision);
        return;
      }
    }
    void handle(request, response).catch(() => {
      log("runtime.request_failed");
      if (!response.headersSent) response.writeHead(500, { "Cache-Control": "no-store" });
      response.end();
    });
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 120000;
  const shutdown = createShutdown({
    server,
    app,
    markStopping: () => {
      globalThis.__thefastestwebStopping = true;
      globalThis.__thefastestwebLifecycle?.markStopping();
    },
    closeResources: async () => { await globalThis.__thefastestwebLifecycle?.close(); },
    log,
  });
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, resolveListen);
  });
  log("runtime.listening");
} catch (error) {
  log("runtime.start_failed", error instanceof EnvironmentError
    ? { code: error.code, fields: error.fields }
    : { code: "RUNTIME_START_FAILED" });
  await app.close().catch(() => undefined);
  await globalThis.__thefastestwebLifecycle?.close().catch(() => undefined);
  process.exit(1);
}
