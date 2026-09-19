# Milestone 2 — Infrastructure modernization

This milestone adds durable background processing on the verified M1 foundation. The implementation is a separate branch based on `modernization/foundation-security`; it does not change the original source archive or deploy production.

## Delivered behavior

- Redis/BullMQ with separate worker/scheduler processes, deterministic daily jobs and bounded shared concurrency.
- PostgreSQL job ledger as transactional outbox, lease fencing, bounded retry/backoff, durable dead-letter state and safe operator inspection/cancel/retry.
- Daily retest HTTP now returns 202 after saving work. Owner-only manual retest/status APIs share site/day/mobile deduplication.
- Redis request limits plus PostgreSQL UTC provider budget covering every actual PSI request, including backup credentials. Dependency failures deny provider calls.
- Worker result, current site metrics and unique job-linked measurement commit together. Cancellation or an obsolete lease cannot overwrite history. Old-day backlog is explicitly skipped.
- Private authenticated Redis with AOF, noeviction and bounded memory; readiness includes Redis policy, new tables and runtime role permissions. Web and jobs close Redis/DB resources on shutdown.

## Files and schema

| Area | Main files |
|---|---|
| Domain/jobs and provider budget | `src/modules/jobs/*`, `src/lib/pagespeed.ts` |
| Transport, workers and scheduling | `src/infrastructure/queue/*`, `src/bin/*`, `scripts/build-jobs.mjs` |
| HTTP and quota | `src/app/api/cron/retest`, `src/app/api/sites/[slug]/retest`, `src/app/api/jobs/[id]`, `src/modules/security/rate-limit.ts` |
| DB migration | `src/db/schema.ts`, `src/db/migrations/0002_m2_job_ledger.sql`, catalog fingerprint, guarded runner |
| Runtime and deployment | `Dockerfile`, `compose.yaml`, `runtime/redis-entrypoint.sh`, runtime registration, health modules, `.env.example`, CI |
| Verification | Four real PostgreSQL/Redis integration suites, queue/ENV/health/provider unit tests, migration checks |

Migration 0002 adds `background_jobs`, `job_events`, `provider_usage`, and nullable unique `speed_tests.background_job_id` with a foreign key. Existing 0000/0001 SQL and fingerprints remain unchanged. Apply the new migration using the owner-only CLI and explicitly grant runtime DML on the three tables. No runtime process creates or migrates schema automatically.

The actual private dump was restored, migrated with the committed M1 runner, then upgraded with the M2 runner. Aggregate hashes across all ten existing M1 tables confirmed unchanged original/M1 column values, sequence and migration checksums/timestamps. Counts remain 444 users, 187 sites, 17,595 measurements, 1,262 speed checks, 7 ad slots, 202 ad clicks, 0 payments and 1 legacy cron record. Every original measurement retains a NULL job reference. No synthetic rows were inserted into the preserved snapshot.

## Environment and operations

New typed settings: `REDIS_URL`, `QUEUE_PREFIX`, `WORKER_CONCURRENCY`, `PSI_REQUESTS_PER_MINUTE`, `PSI_REQUESTS_PER_DAY`, `SCHEDULER_ENABLED`, `SCHEDULER_INTERVAL_SECONDS`, `JOB_MAX_ATTEMPTS`, `WORKER_HEALTH_PORT`, `SCHEDULER_HEALTH_PORT`. The Redis container separately uses `REDIS_PASSWORD` and `REDIS_MAXMEMORY_MB`.

Production web/worker/scheduler require authenticated Redis and the least-privilege DB URL. Worker/scheduler do not need Google OAuth credentials. Shared policy values must match across all roles. The scheduler defaults disabled and is excluded from the default Compose profile; stop old scheduling before enabling it. [QUEUES](QUEUES.md) describes exact commands and recovery; [DEPLOYMENT](DEPLOYMENT.md) covers Coolify resources.

## Verification

- ESLint and TypeScript checks passed.
- 205 unit tests across 24 files passed.
- 60 real PostgreSQL/Redis application integration tests across 4 files passed, plus 9 migration verification groups.
- Actual tests cover concurrent deduplication/leases, late cancelled/stale results, retries/dead-letter/operator audit, current-owner access, provider quotas, backup-call reservations, transport loss/recovery, shared limits, missing Redis metadata, producer timeouts and graceful active-worker drain.
- Full `npm audit`: 0 known vulnerabilities. Jobs bundles build on Node24.
- Linux jobs production image starts worker/scheduler without OAuth/browser credentials, runs as UID 1001, returns live/ready 200, and executes safe operator status/inspect. Disabled scheduler exits 1. Jobs SIGTERM exits 0.
- Redis authenticated policy smoke passed. AOF data survived SIGKILL/restart on an isolated volume. During a Redis outage worker/scheduler liveness stayed 200 and readiness became 503 within the deadline, then recovered 200.
- A production web smoke caught a Next dynamic-folder naming conflict that build did not reject; the retest route was aligned with existing `[slug]` routes and ownership tests rerun.
- Secret scan checked 219 intended text files against supplied private credential values: zero matches. Real providers were not contacted by automated tests.

Final image verification used no source or dependency mounts. Web pages, static
assets, sitemap, auth session and all health aliases returned 200; cron returned
401 without authorization and 202 with a synthetic secret. Revoking the synthetic
runtime role's `provider_usage` INSERT grant changed readiness to 503; restoring
the grant restored 200. Redis unavailability kept web liveness at 200 and made
readiness return 503 in approximately three seconds, then recover to 200. Worker,
scheduler and operator bundles matched the current source build by SHA-256. Safe
operator status/inspect passed, and final web/worker/scheduler processes all
handled SIGTERM and exited 0. Missing production configuration exited 1 before
listening. Disposable test resources were cleaned up.

Verified local Docker image IDs (no registry image or production deployment was
published):

- Web: `sha256:d6f03e9799f7f5b4d2eb7fa3d062fe9194248813e847ea244199abf0e8c74f18`
- Worker/scheduler: `sha256:9804558051c8456f092a5fab5f3185bab5099a0179be8ae4613c7842384dd9e5`
- Redis: `sha256:e01e77bea2e656b52e4a530b6169851a58b29b54ee55bc68926e5fe22004e4a9`

## Preserved behavior and limits

Existing Google identity, ownership, verified submission proofs, private-site access, SSRF/browser isolation and legacy Pro data remain intact. Original measurements and scores are not rewritten by migration. Legacy payment writes remain disabled; Graph/Dodo/R2 and future queue consumers are not implemented in this milestone.

Redis can lose minute-window counters after storage loss; the PostgreSQL daily provider budget survives independently. A crashed external request may be repeated because the provider response and DB commit cannot be one transaction; unique job-linked history prevents duplicate persisted measurements. Terminal DB jobs/events are retained; a future archive policy must preserve deduplication evidence.

The manual API is available, but the product UI redesign remains M10. Operator access currently relies on private host/container permissions; human RBAC/admin UI is later work. Production secret rotation, real deployed OAuth/PSI validation, off-host backups, external monitoring and final cutover remain release gates. M3 provider adapters are the next milestone.
