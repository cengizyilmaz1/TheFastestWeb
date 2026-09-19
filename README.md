# TheFastestWeb

A website directory and web performance monitoring application. This branch adds **Milestone 2 — Queue Infrastructure** on the verified security foundation. Weekly competition, founder profiles and the visual redesign remain later milestones.

## Development

Use Node **24.21.0** and npm 11+. Copy `.env.example` to an ignored `.env.local`, configure development PostgreSQL, authenticated Redis and OAuth credentials, then:

```sh
npm ci
npm run db:migrate
npm run dev
```

Before `db:migrate`, export `MIGRATION_DATABASE_URL` into a separate maintenance shell. The CLI intentionally does not load `.env.local`; do not put the migration owner credential in the web environment. The app's `DATABASE_URL` must be a non-owner, non-superuser account. See [database setup](docs/DATABASE.md). An empty development DB contains no fabricated listings.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm audit
npm run build
npm run build:jobs
```

Integration tests require a disposable loopback PostgreSQL database named `tfw_test_*` through `MIGRATION_TEST_DATABASE_URL`, and a loopback Redis database15 through `REDIS_TEST_URL`. They isolate test databases/roles and random queue prefixes. See [database tests](docs/DATABASE.md).

`npm start` runs the regular Next server for local production-build checks. Coolify runs the non-root Docker runtime with explicit HTTP/database shutdown, using port 3000.

## Deployment and current limits

```sh
docker build --target runner -t thefastestweb:web .
docker build --target jobs-runner -t thefastestweb:jobs .
```

No application credentials or database dump belong in the build context/image. Supply runtime secrets in Coolify. Restore/migrate staging first, then check `/health/live` and `/health/ready`.

Google sign-in preserves existing user IDs. Listings require a server-issued, expiring, single-use mobile test result. Unsafe legacy payment writes are paused while existing Pro access remains intact.

Web, worker and scheduler run as separate processes. PostgreSQL persists job state and provider daily budgets; BullMQ/Redis transports work and enforces shared request limits. The authenticated cron route only saves work and returns202. Start the scheduler after disabling the old scheduler and setting `SCHEDULER_ENABLED=true`; see [queue operations](docs/QUEUES.md) and [Coolify deployment](docs/DEPLOYMENT.md).

Dodo, Microsoft Graph, R2, weekly competitions and the visual redesign remain subsequent milestones. Production launch still requires the documented external credential, backup and monitoring checks.

## Documentation

- [Master plan comparison: all 142 items and roadmap](docs/ROADMAP.md)
- [Milestone 1 changes, verification and remaining gates](docs/MILESTONE-1.md)
- [Milestone 2 changes and verification](docs/MILESTONE-2.md)
- [Queue architecture, budgets and operator commands](docs/QUEUES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Google authentication](docs/AUTH.md)
- [Dependencies and compatibility decisions](docs/DEPENDENCIES.md)
- [Security](docs/SECURITY.md)
- [Database](docs/DATABASE.md) and [migration](docs/MIGRATION.md)
- [Coolify deployment](docs/DEPLOYMENT.md) and [runbook](docs/RUNBOOK.md)
- [Retired maintenance scripts](scripts/local/SCRIPTS.md)

Private source bundles, SQL exports, credentials and audit artifacts stay outside Git.
