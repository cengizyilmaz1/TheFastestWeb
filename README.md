# TheFastestWeb

A website directory and web performance monitoring application. The long-term product includes weekly competition and founder profiles; this branch implements **Milestone 1 — Foundation & Security** only.

## Development

Use Node **24.21.0** and npm 11+. Copy `.env.example` to an ignored `.env.local`, configure your own development database/OAuth credentials, then:

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
```

Integration tests require an explicitly disposable loopback PostgreSQL database named `tfw_test_*`, configured through `MIGRATION_TEST_DATABASE_URL`. They create and remove only isolated test databases/roles; never point them at a production connection. See [database tests](docs/DATABASE.md).

`npm start` runs the regular Next server for local production-build checks. Coolify runs the non-root Docker runtime with explicit HTTP/database shutdown, using port 3000.

## Deployment and current limits

```sh
docker build -t thefastestweb:m1 .
```

No application credentials or database dump belong in the build context/image. Supply runtime secrets in Coolify. Restore/migrate staging first, then check `/health/live` and `/health/ready`.

Google sign-in preserves existing user IDs. Listings require a server-issued, expiring, single-use mobile test result. Unsafe legacy payment writes are paused while existing Pro access remains intact. Redis/BullMQ, Dodo, Microsoft Graph, R2, weekly competitions and the visual redesign are subsequent milestones. This foundation is **not** approval for a full product production release.

## Documentation

- [Master plan comparison: all 142 items and roadmap](docs/ROADMAP.md)
- [Milestone 1 changes, verification and remaining gates](docs/MILESTONE-1.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Google authentication](docs/AUTH.md)
- [Dependencies and compatibility decisions](docs/DEPENDENCIES.md)
- [Security](docs/SECURITY.md)
- [Database](docs/DATABASE.md) and [migration](docs/MIGRATION.md)
- [Coolify deployment](docs/DEPLOYMENT.md) and [runbook](docs/RUNBOOK.md)
- [Retired maintenance scripts](scripts/local/SCRIPTS.md)

Private source bundles, SQL exports, credentials and audit artifacts stay outside Git.
