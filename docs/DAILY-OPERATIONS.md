# Daily operations on Coolify

The application uses the independent scheduler and BullMQ workers. No HTTP cron
or host crontab is required. `/api/cron/retest` returns 410, including requests
with an old bearer secret; remove any external calls to that endpoint.

## Release and activation

1. Run lint, type checking, unit/integration tests, dependency audits, production
   web/jobs builds and the isolated browser smoke. Integration credentials must
   target disposable loopback databases as documented in [DATABASE.md](DATABASE.md).
2. Push the reviewed commit, wait for CI and deploy that exact SHA through Coolify's
   managed production Compose wrappers. Preserve the existing independent database
   resources and private volumes. Follow the source/image verification and rollback
   procedure in [PRODUCTION.md](../runtime/PRODUCTION.md).
3. Confirm canonical HTTPS and web/worker/scheduler readiness. Check that no legacy
   synchronous retest implementation or external cron remains active.
4. Set `SCHEDULER_ENABLED=true` as a runtime-only Coolify variable and redeploy the
   application. Only the scheduler receives this flag. It generates daily UTC
   measurements, award/badge checks, ranking closure and maintenance. Existing
   jobs continue to dispatch with the flag false.
5. Read `/health/ready` inside the scheduler container: it must report
   `generation-and-dispatch`. Confirm successful `scheduler.tick_completed`
   records and use the worker's `node dist/jobs/queue-admin.cjs status` command
   to follow persisted work and daily measurement coverage.

## First cycle and recurring checks

Each eligible site needs one mobile and one desktop job, with two PageSpeed samples
per job. A baseline cycle therefore requires four provider calls per site, plus
retries and manual/submission traffic. At the default 10 requests/minute, a batch
of 151 sites needs at least about 61 minutes for provider calls alone; the default
daily budget is 1,000 calls. Waiting/delayed jobs during this interval do not alone
indicate failure. Quota deferral preserves the retry budget.

Inspect the daily UTC coverage alongside job states, oldest due timestamps,
expired leases, provider usage and safe email failure aggregates. Redis completed
counts describe transport deliveries; PostgreSQL status is the authoritative
business result. A completed BullMQ delivery can correspond to a failed domain job.

Investigate stalled coverage, expired leases or growing failed totals. Check
worker/provider health before a bounded operator retry. Old-day performance jobs
are skipped as superseded; the current day's jobs produce the current evidence.
Failed or ambiguous emails require review and must never be bulk replayed merely
to make the queue look clean. `Mail.Send` token permission alone does not establish
mailbox authorization or successful delivery.

Keep Coolify database backups active independently of job scheduling. Inspect
backup results and periodically restore to an isolated database. Screenshot R2
storage is separate from a private offsite database backup destination.

To pause new periodic work, set the scheduler flag false and redeploy. Existing
outbox work still dispatches. To stop dispatch and processing, stop the scheduler
and worker together; retain Redis persistence and the PostgreSQL ledger for recovery.
