# Operations runbook — M2

1. Create private PostgreSQL18 and authenticated Redis storage in Coolify. Use separate migration/application DB roles; Redis requires AOF everysec, noeviction and bounded memory. Follow DATABASE.md and DEPLOYMENT.md.
2. Restore an encrypted backup into staging, run the guarded migration through 0002, and compare original counts/ownership/history. Run owner credentials only in the maintenance job; grant the runtime role DML on new job/event/provider tables.
3. Build web and jobs Docker targets without secrets. Record both image digests. The web runtime includes sandboxed Chromium; the jobs runtime currently needs no browser.
4. Configure fresh runtime credentials. OAuth stays in web; PSI keys reach web and worker; scheduler receives DB/Redis and shared queue policy. Keep WORKER_CONCURRENCY and both PSI budgets identical across roles.
5. Deploy Redis, web and worker. Check live/ready endpoints and application role permissions. PostgreSQL and Redis have no published host ports in the production template.
6. Disable the previous scheduler, enable the new scheduler profile and SCHEDULER_ENABLED=true. Verify scheduler ready, a maintenance job, queue status and a controlled retest. The compatibility cron now saves work and returns 202.
7. Validate Google sign-in, existing ownership, actual PSI and submission with deployed credentials. These real-provider checks remain release gates; local tests use synthetic data and do not contact those providers.
8. Use the private queue-admin CLI for counts, safe inspection, cancellation and audited retry. Inspect correlation IDs, oldest pending age, exhausted budgets, failed jobs, DB connections, Redis memory and AOF errors. See QUEUES.md for exact commands/recovery rules.
9. Exercise staging dependency outage and recovery. Missing Redis causes ready 503 and provider requests fail closed; reconnect should restore readiness. A lost Redis queue is rebuilt from PostgreSQL, including expired leases.
10. Verify SIGTERM shutdown: web deadline 25 seconds/grace 30; jobs deadline 150 seconds/grace 160. Unfinished jobs after a hard kill must recover through lease expiry without duplicate history.
11. Retain off-host DB backups and previous compatible image digests. Stop scheduler and drain/stop workers before rolling web/jobs back together. Keep additive schema and data; restore into a new isolated DB only if required, validate, then switch connections.

Dodo, Graph, R2, screenshot sharing, weekly competitions and the product redesign remain later milestones. Public launch remains gated by master-plan item 136, secret rotation, deployed OAuth/provider checks, monitored backups and a rehearsed rollback.
