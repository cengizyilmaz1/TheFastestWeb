# Coolify deployment foundation (Milestone 1)

This milestone prepares the web service and PostgreSQL. Redis, queues, workers,
Dodo, Microsoft Graph and screenshot storage belong to later milestones. Passing
the web health check does not certify those future release requirements.

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

`docker build -t thefastestweb:m1 .` takes no application secrets. `.dockerignore`
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

Required production values are `DATABASE_URL`, `AUTH_SECRET` (at least 32
characters), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `AUTH_TRUST_HOST=true`.
Both public origins must use HTTPS and resolve to the same origin in production.
The proxy must overwrite
forwarded host/protocol/IP headers, and only the trusted proxy should reach port
3000. Google OAuth's authorized redirect is
`https://thefastestweb.site/api/auth/callback/google`.

`GOOGLE_PSI_API_KEY`, `GOOGLE_PSI_API_KEY_BACKUP`, `CRON_SECRET` (at least 32
characters when set) and `UNAVATAR_API_KEY` enable their respective integrations.
Absence of `CRON_SECRET` must keep the retest endpoint closed. All supplied legacy
credentials must be replaced with credentials belonging to the new owner.

Legacy Polar checkout/webhooks are retired and accept no `POLAR_*` credentials.
Existing payment records and entitlements remain intact. The secure payment
replacement belongs to Milestone 3. Resend is off unless
`ENABLE_LEGACY_RESEND=true` is explicitly selected, which also requires
`RESEND_API_KEY`. Merely having an old key does not enable it. Compose keeps legacy
email disabled; do not enable it for an M1 public release before provider review.

The non-secret `.env.example` lists all supported values. For development copy it
to `.env.local`. Docker Compose normally reads `.env` for interpolation; keep that
file local, or supply values through Coolify's runtime secret UI. An application
database URL should use the internal `postgres:5432` hostname in Compose and a
dedicated non-superuser application role. The administrator password is used only
to bootstrap PostgreSQL, never to authenticate the web service.

## PostgreSQL and Coolify

1. Create the PostgreSQL 18 service and a persistent volume. Compose mounts
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
   `/health/ready` checks the M1 schema with a zero-row query and verifies that the
   application role has no administrator flags, database/table ownership or
   `CREATE` privilege on the public schema. The aliases
   `/api/health` and `/api/ready` remain available. All are
   uncached and return `503` while shutting down. A missing M1 column/table, grant
   or unsafe role returns `503`. Readiness does not replace full migration/data
   validation or checks of external providers. Configure Coolify's ingress health
   check to use `/health/ready`; the image's own liveness probe uses `/health/live`.
6. Complete OAuth, PageSpeed, browser and shutdown smoke tests before any public
   launch. Keep old and new schedulers mutually exclusive.

`compose.yaml` is a two-service foundation with no automatic restore, schema
migration, destructive maintenance schedule or administrator application login.
It exposes the web port to the private Docker network; Coolify provides ingress.

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
