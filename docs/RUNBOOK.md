# Operations and release runbook

## Prepare an isolated release

1. Pin the reviewed Git commit and record web, jobs, migration and screenshot image digests. Build without secrets. Keep automatic deploy disabled during migration.
2. Create private PostgreSQL 18.6 and authenticated Redis services with separate persistent volumes. Redis requires AOF everysec, noeviction and bounded memory. Publish neither service to the host network.
3. Create separate `tfw_migrator` and `tfw_app` roles. Keep owner credentials out of web/worker environments. Follow [DATABASE.md](DATABASE.md) and [MIGRATION.md](MIGRATION.md).
4. Preserve the original dump offline. Prepare restore SQL privately, restore into an isolated database, run all eight guarded migrations through `0007_founder_invitations`, and compare every old column, ownership link, sequence value and prior migration entry. The final schema has 43 public tables, one public view, one public sequence and eight separate `app_meta.schema_migrations` entries. Fail on any unexplained difference. Grant only reviewed runtime privileges, including invitation-table DML; neither startup nor readiness applies migrations.
5. Configure fresh runtime secrets in Coolify. For the requested demo use `DEPLOYMENT_MODE=demo`, matching HTTPS origins, and disabled payments, email, analytics and scheduled monitoring. Never enable old scripts or reuse old provider secrets.
6. Start web, worker and dispatcher, then verify live/ready endpoints. Check public routes, anonymous private-route denial, mobile navigation, light/dark theme and real directory/history data. Confirm demo robots and response headers forbid indexing.
7. Verify sandboxed Chrome in web and worker with `node runtime/browser-smoke.mjs`. The screenshot service has separate [deployment and isolation checks](../services/screenshot/README.md). Never add `--no-sandbox`, privileged mode or `SYS_ADMIN` to make a check pass.

## Final domain and provider activation

The demo has separate acceptance conditions from a paid production service. Before activation:

- Set final HTTPS origins and Google authorized callback. Verify a real account sign-in preserves identity and ownership. Supply new PageSpeed credentials and verify an actual two-sample test for each device.
- Configure Dodo test mode, products and exact prices/currencies/intervals. Verify signed-event replay, payment, refund, subscription transitions and separate account/site entitlements. Test ad capacity contention, indefinite uncertain holds, moderated creative approval and purchased duration. Follow [PAYMENTS.md](PAYMENTS.md).
- Scope Graph application `Mail.Send` to the sender mailbox, confirm recipient delivery and unsubscribe/preferences behavior. HTTP 202 does not prove delivery. Follow [EMAIL.md](EMAIL.md).
- Configure separate public/private R2 buckets, scoped credentials, lifecycle and public cache domains. Verify authenticated private objects, public screenshots, capture retention and private-site behavior.
- Activate analytics after verifying consent, GPC/DNT, private-route exclusion and idempotent revenue events. Configure Search Console/Bing verification for the final domain.
- Stop the old scheduler first. Set `SCHEDULER_ENABLED=true` to enable scheduled generation. The dispatcher still runs with this flag false, allowing manual work without automatic monitoring. Verify one daily job per site/device, provider budgets, closed snapshots and notification deduplication.
- Set `DEPLOYMENT_MODE=production` when its required configuration is valid. Recheck canonical URLs, robots, sitemap children and owner contact details in legal pages.

## Monitoring and recovery

Poll readiness every minute from an independent monitor; alert after three failed checks. Alert on disk space below 20%, PostgreSQL connection pressure, Redis memory above 80%, failed AOF persistence, exhausted daily PSI budget, growing failed jobs and oldest pending work exceeding the expected provider window. Logs expose correlation IDs and safe codes, not credentials or raw user data. Use authenticated admin or the private queue CLI for inspection; administrative mutations require reason, preview and confirmation.

Back up PostgreSQL daily and before migrations, encrypt backups and keep a copy away from this host. Suggested initial retention is 7 daily, 4 weekly and 3 monthly copies; confirm storage budget and recovery objectives before final launch. A local Docker volume is not a backup. Rehearse restore into an isolated database and compare fingerprints, role restrictions and readiness. Record backup time, hash, restore duration and tested revision without secrets.

Redis delivery is recoverable from the PostgreSQL ledger. Never use `FLUSHALL` or delete successful jobs to clear an alarm. Stop scheduling before recovery, preserve failed storage, restore authenticated AOF service, then reconcile pending/expired work using existing job identities. Committed measurements and entitlements must not repeat.

For rollback, stop the scheduler, drain workers (150-second deadline; 160-second container grace), then replace web/jobs together with previous compatible immutable images. Web has a 25-second deadline and 30-second grace. Keep additive schema and data. If a database restore is necessary, restore into another isolated database, verify it, then switch connections explicitly. Never overwrite a live database as automatic rollback. Payments and sent email cannot be undone by an image rollback.

## Repeatable validation

`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm audit`, `npm run build` and `npm run build:jobs` are code gates. Integration tests require disposable loopback PostgreSQL/Redis. `npm run test:public` exercises public pages at desktop/mobile widths with Playwright and axe; set `SMOKE_BASE_URL` and optionally `PLAYWRIGHT_CHANNEL=msedge`. Artifacts remain in ignored `test-results/`. Lighthouse must use a production build and identify its environment; its scores are not customer website measurements.

Real OAuth, provider sandbox deliveries, off-host backup storage and external monitoring require final scoped service accounts. Record pending checks explicitly; local provider mocks are not evidence of live delivery.
