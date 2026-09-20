# TheFastestWeb

A website directory and performance monitoring application built with Next.js 16, React 19, PostgreSQL 18 and Drizzle. The current interface includes the leaderboard, website reports, categories, blog, verified submissions, pricing and a focused payment/ad administration panel. The expanded dashboard, founder, comparison and competition pages were removed; retained backend capabilities are not additional public pages.

Dodo checkout and entitlements, Microsoft Graph notifications, R2 media, the separate screenshot service and consent-based analytics are implemented. Their runtime gates default off. Implemented adapters and local tests do not establish that a real provider account, final domain or production deployment has passed its release checks.

## Development

Use Node **24.21.0** and npm 11+. Install dependencies, then copy `.env.example` to an ignored `.env.local` and configure development PostgreSQL, authenticated Redis and Google OAuth:

```sh
npm ci
npm run dev
```

Provision and migrate the database before using the application. In a separate maintenance shell, securely export `MIGRATION_DATABASE_URL`, then run `npm run db:migrate`. This CLI intentionally does not load `.env.local`. Keep the migration owner credential out of the web, worker and scheduler environments; their `DATABASE_URL` must use a non-owner, non-superuser role. See [database setup](docs/DATABASE.md) and [migration procedure](docs/MIGRATION.md). An empty development database contains no fabricated listings or product prices.

`npm run build` creates the Next production build; `npm start` runs the regular Next server for local checks. `npm run build:jobs` creates the independent process bundles used by `npm run worker`, `npm run scheduler`, `npm run queue:admin` and `npm run admin:bootstrap`. Supply their configuration through the process environment; the background entrypoints do not load Next's `.env.local` automatically. The Docker entrypoint provides the production HTTP/database shutdown contract.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm audit
npm run build
npm run build:jobs
npx playwright install chromium
npx tsx scripts/public-runtime-smoke.ts
```

Integration tests and the runtime smoke require a **disposable loopback test environment**: `MIGRATION_TEST_DATABASE_URL` must select a `tfw_test_*` PostgreSQL database with permission to create isolated databases/roles, and `REDIS_TEST_URL` must select authenticated loopback Redis database 15. Follow the local test-role configuration in [DATABASE.md](docs/DATABASE.md). Never point these checks at production or a restored customer database.

The runtime script starts the built standalone artifact on loopback port 3200, creates synthetic actors and listings in its isolated database, and runs public/private browser and bounded-load checks. It generates authentication material in memory, disables external providers and cleans up its fixture. Reports stay in ignored `test-results/`. Set `SMOKE_LIGHTHOUSE=true` in the process environment to additionally run the Lighthouse checks. A successful source build is separate from these runtime checks and from real-account provider testing.

## Coolify deployment

The repository supplies separate Docker targets:

```sh
docker build --target runner -t thefastestweb:web .
docker build --target jobs-runner -t thefastestweb:jobs .
docker build --target migration-runner -t thefastestweb:migrate .
```

The managed installation uses independent PostgreSQL and Redis Coolify Resources plus an application Resource containing web, worker and scheduler. PostgreSQL and Redis retain persistent private volumes; only web port 3000 is routed through the proxy. Web/jobs run as UID 1001 with build-installed sandboxed Chromium. Application credentials and database backups are excluded from builds; migrations run as an explicit maintenance operation, never automatically during startup. The combined five-service `compose.yaml` remains an alternative for a separate installation.

For the managed installation, use **raw Compose**, `compose.managed.yaml` plus `compose.coolify.yaml`, and `runtime/coolify-managed-build.sh` / `runtime/coolify-managed-start.sh`. The optional production routing overlay and release-evidence procedure are in [runtime/PRODUCTION.md](runtime/PRODUCTION.md); these instructions do not assert that deployment has completed. Disable build-argument injection and keep credentials runtime-only. Raw mode preserves service-specific environment boundaries; the normal parser can otherwise inject the full application environment into every service. Follow [COOLIFY-COMPOSE.md](docs/COOLIFY-COMPOSE.md) for resource settings and [DEPLOYMENT.md](docs/DEPLOYMENT.md) for readiness.

Web, worker and scheduler are independent processes. PostgreSQL is the durable job ledger; Redis/BullMQ transports work and applies shared limits. **Keep the scheduler process running when `SCHEDULER_ENABLED=false`: it still dispatches existing outbox jobs and retries.** The flag only disables generation of scheduled monitoring/maintenance work. Disable the old scheduling mechanism before enabling generation on the new stack. See [QUEUES.md](docs/QUEUES.md).

`/health/live` reports process health. `/health/ready` checks migrated schema, runtime grants/role safety, Redis persistence/policy and shutdown state. Worker/scheduler readiness also verifies their actual process loop. Readiness does not verify OAuth, provider delivery, DNS or backups.

## Runtime gates and release checks

`.env.example` and `src/config/env.ts` define configuration. `SITE_URL` is the canonical origin; `AUTH_URL`, when supplied, must match. Production web requires database, authenticated Redis, auth secret and Google OAuth credentials. Worker/scheduler receive role-specific configuration without the web auth secret. Legacy Polar and Resend integrations are removed; historical payment records, Pro grants and ownership remain preserved.

| Runtime setting | Behavior and prerequisite |
|---|---|
| `DEPLOYMENT_MODE=demo` | Demo indexing guards; Google login may remain unavailable. Payments, email, analytics and scheduled generation cannot be enabled. Database, Redis and auth secret are still required. |
| `PAYMENTS_ENABLED` | Requires Dodo keys, server-owned product catalog and verified account webhook/checkout tests. `DODO_ENVIRONMENT` defaults to `test_mode`; live activation is a separate operator action. |
| `EMAIL_ENABLED` | Requires Microsoft 365 app/mailbox configuration and unsubscribe signing secret. Notification records and authenticated backend APIs remain available when delivery is disabled; the former dashboard UI is not part of this release. |
| `STORAGE_ENABLED` / `SCREENSHOTS_ENABLED` | Require scoped R2 storage and authenticated screenshot service configuration respectively; private assets are not automatically public. |
| `ANALYTICS_ENABLED` | Requires new-owner GA/DataFast identifiers and explicit browser consent. Internal domain analytics remain separate from browser tracking. |
| `SCHEDULER_ENABLED` | Enables scheduled generation after migration and old-scheduler cutover; false retains outbox dispatch. |

Before public production launch, complete final-domain OAuth, provider sandbox/account tests, restore rehearsal, off-host backups and monitoring checks in [RUNBOOK.md](docs/RUNBOOK.md). Disabled features show their availability honestly; client callbacks never grant purchases or invent test results.

## Documentation

- [Current launch handoff and remaining checks](docs/LAUNCH.md), [production routing and release evidence](runtime/PRODUCTION.md)
- [Architecture](docs/ARCHITECTURE.md), [dependencies](docs/DEPENDENCIES.md), [security](docs/SECURITY.md) and [Google authentication](docs/AUTH.md)
- [Database](docs/DATABASE.md), [migration](docs/MIGRATION.md), [queues and operations](docs/QUEUES.md)
- [Coolify raw Compose](docs/COOLIFY-COMPOSE.md), [deployment](docs/DEPLOYMENT.md) and [runbook](docs/RUNBOOK.md)
- [Submission workflow](docs/SUBMISSIONS.md), [website identity and claims](docs/WEBSITE-IDENTITY.md), [founder collaborations](docs/FOUNDER-COLLABORATIONS.md)
- [Measurement/ranking methodology](docs/METHODOLOGY.md), [awards and badges](docs/AWARDS-AND-BADGES.md), [comparison pages and journal](docs/COMPARE-AND-JOURNAL.md)
- [Providers](docs/PROVIDERS.md), [payments](docs/PAYMENTS.md), [ad inventory](docs/ADS.md), [email](docs/EMAIL.md), [analytics](docs/ANALYTICS.md) and [administration](docs/ADMIN.md)
- [Design system](docs/DESIGN.md), [SEO](docs/SEO.md) and [screenshot service](services/screenshot/README.md)
- [Master-plan baseline and implementation notes](docs/ROADMAP.md); historical verification checkpoints: [M1](docs/MILESTONE-1.md), [M2](docs/MILESTONE-2.md)
- [Retired local maintenance scripts](scripts/local/SCRIPTS.md)

Private source bundles, SQL exports, credentials and audit artifacts stay outside Git.
