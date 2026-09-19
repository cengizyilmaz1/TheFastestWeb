# Central screenshot service

This stack is deployed separately from TheFastestWeb. Its PostgreSQL ledger owns capture state, idempotency, daily quotas and staged media; Redis/BullMQ is a recoverable delivery mechanism. The API never runs a browser. The worker produces a JPEG original and a metadata-stripped WebP, stores bytes in R2, and exposes only metadata to the main application. Private drafts use a separate private bucket and authenticated image delivery.

The existing IndieTools renderer was inspected read-only and remains unchanged. The default `remote` backend calls its existing authenticated `POST /capture` protocol. That renderer supports desktop 1440×900 viewport only; unsupported profiles return HTTP 422. The shipped `local` backend uses pinned Chromium 153.0.8010.36 with its sandbox and supports desktop, mobile and bounded full-page capture. Enable it in this separate worker when those profiles are needed. No client should point its central URL at the old renderer: the API protocols differ.

## Build and deploy

Use the repository root as build context:

```sh
docker build -f services/screenshot/Dockerfile --target api -t central-screenshot-api .
docker build -f services/screenshot/Dockerfile --target worker -t central-screenshot-worker .
```

`compose.yaml` is a separate Coolify resource. Only API port 3100 receives a private route or authenticated HTTPS public route; worker port 3101 is health-only. Do not publish PostgreSQL or Redis. Use independent secrets, least-privilege DB credentials, a persistent Redis volume with AOF enabled, `maxmemory` bounded and `maxmemory-policy noeviction`. Readiness refuses missing schema, a privileged/owner/DDL database role, or unsuitable Redis durability settings. API and worker must use identical queue prefix/concurrency settings. Production R2 credentials need access only to the screenshot project's two buckets.

Provision a dedicated database named `central_screenshot` with a separate migration owner and runtime login. Supply `SCREENSHOT_MIGRATION_DATABASE_URL` only to a one-off migration container, then run:

```sh
node dist/screenshot/migrate.cjs --apply
```

The migration does not run during API/worker startup. As the owner, grant the runtime role `CONNECT` to this database, `USAGE` on `public`, and `SELECT, INSERT, UPDATE, DELETE` on its four tables. Revoke public `CREATE`; the runtime role must not own the database, schema or tables and must not inherit the migration owner. Configure only its URL as `SCREENSHOT_DATABASE_URL`. Back up this ledger and R2 before upgrades; losing Redis alone does not lose capture state.

Required service settings:

| Variable | Purpose |
| --- | --- |
| `SCREENSHOT_DATABASE_URL` | Dedicated least-privilege runtime connection |
| `SCREENSHOT_REDIS_URL` | Redis URL with at least a 32-character password |
| `SCREENSHOT_CLIENTS_JSON` | Client configuration described below |
| `SCREENSHOT_CAPTURE_BACKEND` | `remote` (default) or `local` |
| `SCREENSHOT_RENDERER_URL`, `SCREENSHOT_RENDERER_TOKEN` | Trusted renderer origin and server-only token; required only for remote backend |
| `STORAGE_ENABLED` | `true` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Screenshot-only bucket credentials |
| `R2_PRIVATE_BUCKET` | Required private bucket, with no public domain |
| `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | Distinct public bucket and HTTPS origin for approved public captures |

`SCREENSHOT_CLIENTS_JSON` is an array containing `id`, `namespace`, and `tokenHash` (SHA-256 of the raw client token). Optional fields are `requestsPerMinute` (default 10), `requestsPerDay` (250), and `allowPublic` (false). IDs/namespaces are unique lowercase letters, digits and hyphens. Generate a different random 32-byte hexadecimal token for each client using a secure secret manager; store only its hash in the central service. TheFastestWeb uses ID/namespace `thefastestweb` with public captures allowed. IndieTools uses `indietools` with public captures forbidden. Never copy existing tokens into source or logs.

TheFastestWeb uses server-only `SCREENSHOTS_ENABLED`, `SCREENSHOT_SERVICE_URL`, `SCREENSHOT_SERVICE_TOKEN`, `SCREENSHOT_CLIENT_ID=thefastestweb`, and `R2_PUBLIC_BASE_URL` for validating returned public media URLs. The actual job handler verifies published lifecycle and source URL both before requesting and before committing metadata; async waiting does not spend a retry attempt. Its UUID is the central idempotency key. Requests expire after 24 hours rather than polling forever.

The private IndieTools repository has a separate, uncommitted migration patch and focused tests. It retains its existing product review/publication flow, requests private captures and downloads originals via authenticated API. Partial central configuration fails closed. Existing renderer credentials and containers can remain available for rollback. The private patch and repository history are intentionally not copied into this public repository.

## API

All capture routes require `Authorization: Bearer <client-id>.<64-character-hex-token>`. Client identity and R2 namespace come from authenticated configuration, never request data.

- `POST /v1/captures` also requires a UUID `Idempotency-Key`. JSON fields: `url`; optional `device` (`desktop`/`mobile`), `mode` (`viewport`/`fullpage`), `viewport` (bounded width/height), `history` (`none`/`daily`/`weekly`/`monthly`), `visibility` (`private` by default). Returns HTTP 202 with `{id,status}` while pending; HTTP 200 includes metadata when ready. Reusing the same key with a different request returns 409.
- `GET /v1/captures/:id` returns only the authenticated client's receipt and result. A different client's ID returns 404.
- `GET /v1/captures/:id/image` returns its JPEG original after ownership checks. It uses `private, no-store`; private images never receive a public URL.
- `GET /health/live` reports process state; `GET /health/ready` checks actual DB/Redis dependencies. These return no connection details or credentials. A worker also checks its consumer state.

Result metadata includes object key, optional public URL, dimensions, content type, size, SHA-256 hash, actual capture timestamp and retention expiry. Pending, failed and expired states never fabricate images or scores. Original URLs can contain sensitive query strings: they live only in the access-controlled ledger and are excluded from logs.

## Resource and recovery policy

The local pool has two slots by default (`SCREENSHOT_CONCURRENCY`, max four). Each slot creates a new sandboxed browser/profile and a short-lived proxy. Browser subprocesses receive no DB/R2/client secrets in their environment. Public DNS is validated again at every proxy connection and sockets connect to the validated IP; redirects and subresources cannot reach loopback, private, link-local, metadata or reserved addresses. QUIC, non-proxied WebRTC, direct DNS fallback, WebSocket requests, downloads, popups and service workers are constrained. HTTPS tunnels pin their destination before the browser connects. No `--no-sandbox`, privileged mode or `SYS_ADMIN` is shipped. Use a dedicated worker host for additional kernel/container isolation and repeat the browser smoke on the actual Coolify host.

Launch is limited to 8 seconds, navigation to 12 seconds, browser execution to 20 seconds, proxy lifetime to 25 seconds, requests to 180, proxy connections to 80, proxied traffic to 24 MiB, HTML to 2 MiB, capture height to 8000 and image pixels to 16 million. A validated full-page clip is frozen before capture so a page cannot grow without bound between checks. JPEG and WebP each have a 6 MiB cap. Each provider operation has a 15-second deadline. The legacy remote response has its own 35-second deadline and 6 MiB JSON limit.

The service lease lasts 90 seconds, retries at most three times, and uses fresh lease-specific object paths. Staged object records are committed before uploading, so a crash between upload and DB commit leaves a recoverable cleanup record. Stale workers cannot complete a newer lease. A failed deletion retains its record. Maintenance runs serially every 60 seconds after the previous sweep, deletes at most 16 objects in batches of four, then marks expired captures. Watch cleanup backlog as client volume grows; expiration means API access is immediately denied while physical deletion is eventual. Bucket lifecycle expiry should be configured as an additional backstop matching retention policy.

API reconciliation restores missing Redis jobs every five seconds, removes only retained terminal transport jobs, and reapplies global concurrency after Redis loss. Actual capture state and quotas remain in PostgreSQL. The main app separately preserves the central receipt and polls without resubmitting work. SIGTERM marks readiness false and drains API requests (30-second deadline) or worker/cleanup tasks (120-second deadline); Compose grants 40/130 seconds respectively. Abrupt termination is recovered through expiring leases and staged-object cleanup.

Cache identity includes normalized URL, client, device, viewport, mode, privacy, history policy, and capture version. HTTP/HTTPS and www/non-www are distinct. `SCREENSHOT_CACHE_HOURS` defaults to 6. Normal retention defaults to 7 days; history captures use one cache identity per UTC day, Monday-based week or month and default retention of 30/180/1095 days (`SCREENSHOT_HISTORY_DAILY_DAYS`, `SCREENSHOT_HISTORY_WEEKLY_DAYS`, `SCREENSHOT_HISTORY_MONTHLY_DAYS`). All retention settings have finite bounds. No unlimited archival promise is made.

## Verification

```sh
npx vitest run tests/screenshot
npx vitest run --config vitest.integration.config.mts tests/integration/screenshot.test.ts
```

Integration tests require disposable loopback `tfw_test_*` PostgreSQL and Redis fixture URLs, create their own least-privilege database/queue prefix, and clean up only that namespace. Storage is injected; no real provider uploads are made. Tests cover authentication, private access, request bounds, idempotency, cache concurrency, quota concurrency, stale leases, partial upload recovery, retention failures, corrupt DB payloads and Redis delivery loss. Linux Docker browser smoke separately verifies real sandboxed JPEG/WebP capture under a non-root, read-only runtime. Production R2 credentials, live central deployment, and the private IndieTools cutover require their own deployment verification; the current local tests do not claim those operations happened.
