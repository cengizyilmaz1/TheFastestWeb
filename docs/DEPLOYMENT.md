# Coolify deployment foundation (Milestones 1–2)

The stack contains web, PostgreSQL, Redis, a worker and an explicitly enabled
scheduler. Dodo, Microsoft Graph and screenshot storage belong to later
milestones. Passing health checks does not certify those future release requirements.

## Image and runtime

The Docker image uses Node 24.21.0, Debian Bookworm and Next.js standalone output.
It starts `node runtime/server.mjs` as UID/GID 1001, listens on `0.0.0.0:3000` and runs a
health check every 30 seconds. This small server uses Next.js's documented custom
server API over the standalone artifact. The build explicitly copies the custom
server, its normal `next.config.js`, the central environment validator and Next's
configuration-loader aliases; Next does not trace custom servers automatically.
The entrypoint validates required secrets before calling Next or opening a port.
`tini` forwards signals and reaps child processes. Allow at
least 30 seconds before Docker/Coolify force-kills a container.

`docker build --target runner -t thefastestweb:web .` takes no application secrets. `.dockerignore`
excludes local environment files, dumps, bundles and backups. Next.js downloads
Google fonts during the build, so the builder needs outbound access to the font
hosts as well as npm and the Chrome distribution host. Runtime configuration is
validated by instrumentation before a production server serves requests.

The application image must never contain the production database snapshot.
Restore and migration are separate, reviewed operations against a staging copy
first. Do not run the old incomplete Drizzle migration against restored data.

## Runtime configuration

Set `SITE_URL=https://thefastestweb.site`. `AUTH_URL` defaults to `SITE_URL`.
Instrumentation supplies Auth.js v4's internal `NEXTAUTH_URL` and
`NEXTAUTH_SECRET` variables from the validated `AUTH_*` configuration.

Required web production values are `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET` (at least 32
characters), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `AUTH_TRUST_HOST=true`.
Both public origins must use HTTPS and resolve to the same origin in production.
The proxy must overwrite
forwarded host/protocol/IP headers, and only the trusted proxy should reach port
3000. Google OAuth's authorized redirect is
`https://thefastestweb.site/api/auth/callback/google`.

Worker and scheduler require `DATABASE_URL` and `REDIS_URL`; do not give them
OAuth credentials or the web authentication secret. A Redis URL must use
`redis://` or `rediss://`, include a password of at least 32 characters in
production, and select database 0–15 without query parameters. Use TLS when
connecting across hosts; the supplied Redis service lives on the private Docker
backend network. All processes must use the same `QUEUE_PREFIX` (default `tfw`).

`GOOGLE_PSI_API_KEY`, `GOOGLE_PSI_API_KEY_BACKUP`, `CRON_SECRET` (at least 32
characters when set) and `UNAVATAR_API_KEY` enable their respective integrations.
Absence of `CRON_SECRET` must keep the retest endpoint closed. All supplied legacy
credentials must be replaced with credentials belonging to the new owner.

Legacy Polar checkout/webhooks are retired and accept no `POLAR_*` credentials.
Existing payment records and entitlements remain intact. The secure payment
replacement belongs to Milestone 3. Resend is off unless
`ENABLE_LEGACY_RESEND=true` is explicitly selected, which also requires
`RESEND_API_KEY`. Merely having an old key does not enable it. Compose keeps legacy
email disabled; do not enable it for a public release before provider review.

The non-secret `.env.example` lists all supported values. For development copy it
to `.env.local`. Docker Compose normally reads `.env` for interpolation; keep that
file local, or supply values through Coolify's runtime secret UI. An application
database URL should use the internal `postgres:5432` hostname in Compose and a
dedicated non-superuser application role. The administrator password is used only
to bootstrap PostgreSQL, never to authenticate the web service.

## PostgreSQL and Coolify

1. Create the PostgreSQL 18.6 service and a persistent volume. Compose mounts
   `/var/lib/postgresql`, the parent of the PostgreSQL 18 versioned data directory.
   The database port is not published publicly.
2. Restore the approved backup into staging, prepare the migration baseline and
   provision the application role with only necessary table/sequence privileges.
   The migration/admin role stays separate from `DATABASE_URL`.
3. Validate users, sites, historical tests and ownership using the documented
   database baseline checks. Create an off-host backup and test restoring it.
4. Configure the web resource to build `Dockerfile`, expose port 3000 and bind the
   domain above. Supply secrets only in the runtime environment, never build args.
5. Route only healthy instances. `/health/live` checks process liveness;
   `/health/ready` checks the M1/M2 schema with a zero-row query and verifies that the
   application role has no administrator flags, database/table ownership or
   `CREATE` privilege on the public schema. It checks queue-table write grants,
   Redis connectivity, bounded memory, `noeviction` and healthy AOF persistence.
   The complete dependency check has a three-second deadline. The aliases
   `/api/health` and `/api/ready` remain available. All are
   uncached and return `503` while shutting down. A missing M1 column/table, grant
   or unsafe role returns `503`. Readiness does not replace full migration/data
   validation or checks of external providers. Configure Coolify's ingress health
   check to use `/health/ready`; the image's own liveness probe uses `/health/live`.
6. Complete OAuth, PageSpeed, browser and shutdown smoke tests before any public
   launch. Keep old and new schedulers mutually exclusive.

`compose.yaml` has no automatic restore, schema
migration, destructive maintenance schedule or administrator application login.
It exposes the web port to the private Docker network; Coolify provides ingress.

## Redis, worker and scheduler

Redis **8.10.1** is pinned from the [official Redis release notes](https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/release-notes/redisce/redisos-8.10-release-notes/)
and [Docker image manifest](https://github.com/docker-library/official-images/blob/master/library/redis).
Build targets are `runner` (web), `jobs-runner` (worker/scheduler) and `redis`.
The jobs image contains compiled Node 24 entrypoints and production dependencies;
it has no Chromium binary or runtime TypeScript compiler.

Redis has no host port, uses the internal `backend` network, retains `/data`,
and starts with protected mode, password authentication, AOF `everysec`,
`noeviction` and a 256 MiB memory limit. The container limit is 768 MiB to leave
room for process and AOF rewrite overhead. If raising `REDIS_MAXMEMORY_MB`, also
size the container and host for that overhead. Generate `REDIS_PASSWORD` from 32
random bytes encoded as 64 hexadecimal characters and use it in `REDIS_URL`.
The entrypoint writes a mode-600 temporary configuration and drops to the Redis
user; the password is not passed in the server's command line. Supply it at
runtime, never in a build argument or committed file.

Build and deploy with `docker compose up -d --build postgres redis web worker`.
Use separate Coolify worker/scheduler resources with Docker target `jobs-runner`
and commands `node dist/jobs/worker.cjs` and `node dist/jobs/scheduler.cjs`.
They expose health ports 3001 and 3002 only on the private network. Their
`/health/ready` checks both dependencies and the actual worker/dispatch-loop
state. A stopped loop cannot pass because Redis alone responds. `/health/live`
reports the process state. Do not publish these health ports through ingress.

Default worker concurrency is 2 (maximum 8), retry attempts 3 (maximum 10), and
the scheduler interval 60 seconds. Configure `PSI_REQUESTS_PER_MINUTE` (default
10) and `PSI_REQUESTS_PER_DAY` (default 1000) to fit the provider account. These
are shared budgets, not a separate quota for each replica. Keep
`WORKER_CONCURRENCY` and `PSI_REQUESTS_PER_MINUTE` settings identical across web,
worker and scheduler, because producers restore queue policy after Redis loss.
Each process has its own database pool; multiply `DB_MAX_CONNECTIONS` by the number of web, worker
and scheduler instances when sizing PostgreSQL.

The scheduler is excluded from the normal Compose profile and defaults to
`SCHEDULER_ENABLED=false`. A scheduler process launched with that flag false
exits unsuccessfully. Cut over in this order:

1. Apply and validate the M2 migration on a restored staging copy, including
   `background_jobs`, `job_events`, `provider_usage` and `speed_tests.background_job_id`.
   Grant the runtime role the documented table permissions and verify readiness.
2. Deploy Redis and the worker, then verify worker readiness. Keep the new
   scheduler disabled while the old scheduling mechanism still runs.
3. Stop the old HTTP/CLI scheduling mechanism and confirm no old run is active.
4. Set `SCHEDULER_ENABLED=true` and run
   `docker compose --profile scheduler up -d scheduler`, or start the equivalent
   Coolify resource. Check scheduler readiness after its first successful tick.
5. Confirm one dispatch path, increasing job events and eventual completion in
   the database ledger before allowing production traffic to depend on queues.

Background processes drain for up to 150 seconds on SIGTERM; allow 160 seconds
in Coolify/Compose. They stop taking work, await active work, close their health
server and then close queue/Redis and database connections. A killed process may
leave a lease to expire; recovery must use that same ledger job identity.

## Queue outage and recovery runbook

PostgreSQL's job ledger is authoritative. Redis carries deliveries and may lose
approximately the most recent second of AOF writes during a crash. Completion,
daily provider usage and idempotency must not be inferred from Redis retention.

- **Redis temporarily unavailable:** readiness returns 503 while liveness remains
  available. Check private networking, authentication, disk and Redis health.
  Restore Redis, then verify worker and scheduler readiness plus outbox progress.
  Keep queued database records intact; the scheduler reconciles pending work.
- **Memory full:** `noeviction` rejects writes instead of silently deleting queue
  state. Inspect queue growth and completed/failed retention, pause new scheduling
  if needed, and increase capacity with sufficient host headroom. Do not switch
  to an eviction policy or run `FLUSHALL` to make readiness green.
- **Redis volume lost:** stop scheduling, preserve a PostgreSQL backup, recreate
  the authenticated Redis service with the same queue prefix and persistence
  settings, then start the worker and scheduler. Pending and expired leased jobs
  are recoverable from the ledger; already completed jobs must remain completed.
  Validate job counts, duplicate prevention and daily quota state after recovery.
- **AOF/disk error:** keep the failing service out of readiness. Preserve a copy of
  the Redis volume before a reviewed restore or AOF repair; do not delete files
  from a running service. Use the database ledger to reconcile after recovery.
- **Rollback:** disable and stop the new scheduler first, drain workers, and keep
  the additive M2 tables and Redis volume. Deploy only an image compatible with
  the current schema. Reactivate an old scheduler only after all new scheduling
  has stopped and its data semantics have been reviewed. Never run both.

Do not change `QUEUE_PREFIX` while deliveries are active. Do not restore an old
PostgreSQL snapshot alongside newer Redis deliveries without a reviewed recovery
plan; all restored jobs require ledger validation before execution.

## Linux browser

Chrome for Testing **153.0.8010.36** is paired with Puppeteer **25.11.0**, according
to the [official supported-browser table](https://pptr.dev/supported-browsers).
The exact archive is fetched into `/opt/chrome` during image build.
`CHROMIUM_EXECUTABLE_PATH` and `CHROME_DEVEL_SANDBOX` point to the installed binary
and root-owned setuid sandbox helper. This image targets **Linux amd64** because
that is the supplied Chrome for Testing Linux distribution.

The browser must retain its sandbox. The deployment does not silently add
`--no-sandbox`, privileged mode or `SYS_ADMIN`. Host user namespaces and the
container security policy must support the browser sandbox. Verify rendering on
the actual Coolify host; when unsupported, rendering must fail safely and only
static badge verification remains available. Do not bypass this with a privileged
web container. All remote browser traffic must pass through the application SSRF
protection, including redirects and subresources.

Chrome updates require a coordinated Puppeteer/browser version change, rebuild,
and the security regression suite. There is no runtime browser download.
Run `docker exec <web-container> node runtime/browser-smoke.mjs` to verify the
installed browser and sandbox using static local content, with no remote site.

## Logging, shutdown and rollback

API responses carry `x-correlation-id`. Standard errors contain `error`, `code`
and `correlationId`. Logs are JSON and redact credential fields, raw request
objects, connection strings and common PII. Do not add raw provider exceptions,
request bodies, cookies, email addresses or tokens to log calls.

SIGTERM marks the service as stopping, stops accepting HTTP connections, waits
for in-flight HTTP requests, awaits Next.js cleanup and finally awaits database
pool closure. Shutdown has a 25-second deadline; Coolify's 30-second grace leaves
time for the process to exit. Use the Docker runtime entrypoint in production.
`next dev`/`next start` use a best-effort cleanup listener and do not provide this
explicit application-resource drain contract.

Keep the previous immutable image digest and an off-host database backup. Roll
back the image only when its schema remains compatible; otherwise restore the
approved backup into a separate database and re-run ownership/count checks before
switching `DATABASE_URL`. Never overwrite a live database as an automatic rollback.
