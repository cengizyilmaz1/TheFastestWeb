# Operations runbook — M1

1. Create private PostgreSQL18 storage in Coolify. Configure separate owner/migration and application roles using DATABASE.md. Store a fresh administrator password only in the DB resource.
2. Take an off-host encrypted backup, restore a copy into staging, run the guarded migration, and compare counts/ownership/history with MIGRATION.md. Never start the web image with automatic schema writes.
3. Build the Dockerfile without secrets. Save the resulting image digest.
4. Configure a new HTTPS domain, Google OAuth callback, AUTH_SECRET and the application DATABASE_URL as runtime-only secrets. Configure PSI and optional avatar keys under the new service owner.
5. Run migrations as a separate maintenance job with MIGRATION_DATABASE_URL; then deploy the web resource on private port3000.
6. Check /health/live, /health/ready, Google login and existing ownership, a real PSI measurement and an authenticated submission. Check browser sandbox with `node runtime/browser-smoke.mjs` inside the container.
7. Stop any old scheduler before testing the new cron path. M1 does not run an automatic schedule. An authorized compatibility call handles at most one site; M2 supplies the real worker/scheduler.
8. Observe structured errors by correlation ID. Check DB connection utilization, provider quota failures and failed/expired proofs. Missing metrics, empty history and provider failures must stay visible as such.
9. Send SIGTERM to a staging instance with a request in progress. Confirm HTTP drain, Next cleanup and DB closure before the25-second shutdown deadline.
10. Record the previous image and backup reference for rollback. If the old image is schema-compatible, roll back its digest. Otherwise restore into a new isolated database, validate, then change the application connection. Never auto-overwrite live data.

Redis/worker, Dodo, Graph, R2 and the screenshot service have **not** been provisioned in M1. Their deployment/scheduling instructions become executable only in the corresponding milestones. Public launch remains gated by master-plan item136 and external credential/backup/monitoring checks.
