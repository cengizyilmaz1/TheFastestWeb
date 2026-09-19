# Database operation

Use PostgreSQL 18 with the current supported security patch. The migration catalog fingerprints were verified on PostgreSQL 18.6. No Supabase service or extension is required: UUID generation uses PostgreSQL's built-in `gen_random_uuid()`.

The application and maintenance commands use separate credentials. The database port stays private inside the Coolify network. Auth.js sessions and server authorization enforce user/owner access; no browser receives database credentials.

## Schema and migration ownership

- `src/db/schema.ts` describes the current application schema.
- `0000_snapshot_baseline.sql` is a data-free reproduction of the reviewed public snapshot: eight tables, five enums, a reporting view and an owned sequence. It preserves the historical nullable ad slot timestamp and default UUID generation.
- `0001_m1_verified_results.sql` adds durable verified results, durable request rate counters, canonical site URL keys, explicit legacy methodology labels and query indexes.
- `0002_m2_job_ledger.sql` adds the authoritative job ledger/outbox, job event audit trail, durable daily provider usage and a nullable unique job reference on measurement history. It does not rewrite existing rows.
- `0003_m3_providers.sql` adds provider product/checkout/payment/event/subscription ledgers, durable entitlements, notification preferences and mail delivery state. Stable legacy grants preserve existing Pro/site/ad access independently of provider migration.
- `0004_m5_product_model.sql` adds editable taxonomies, ISO country reference data, private-by-default founder profiles, hashed ownership claims, lifecycle/badge state, screenshots, admin/audit data, achievements and immutable versioned ranking snapshots. Existing measurements receive only explicit sample-count/source metadata; their original values remain unchanged.
- `0005_ad_inventory.sql` adds explicit ad positions and durable reservations. Only distinct observed legacy `(position, order_index)` pairs become available inventory; no capacity or reservation is invented. A partial unique index permits only one held/paid/active reservation per position. Unknown checkout outcomes retain their hold until a definitive operator/provider resolution; time alone never releases held/paid inventory.
- `0006_domain_analytics.sql` adds idempotent, server-owned analytics events with an explicit event-name allowlist. Typed event-specific properties exclude user identities, email, IPs, raw URLs and provider payloads; no historical events are invented. Browser/ad interactions are never treated as proof of payment or a verified person.
- `0007_founder_invitations.sql` adds authenticated cross-account founder consent, seven-day expiry and unique pending invitations. Existing founder relationships and site ownership remain unchanged; no invitation is backfilled. See [FOUNDER-COLLABORATIONS.md](FOUNDER-COLLABORATIONS.md).
- `scripts/db/migrate.ts` is the only supported migration entry point. It also performs the reviewed canonical URL backfill and final `NOT NULL` change. Running the SQL files alone is incomplete.
- `app_meta.schema_migrations` records immutable SQL checksums. Catalog fingerprints cover relations, columns, defaults, constraints, indexes, triggers, views, enums, sequence definitions, policies and non-extension routines/types. Sequence *values* and application rows are deliberately excluded.

Do not run `drizzle-kit push`, `drizzle-kit migrate`, old local migration scripts, or seed scripts against the restored production database. Drizzle-generated proposals go to `.analysis-temp/drizzle-proposals` for review; they are not deployable migrations. Never regenerate already applied baseline files. A future schema change needs a new SQL file, reviewed fingerprint and runner entry.

SQL checksums normalize CRLF to LF so Windows and Linux checkouts agree. Changes to the shared canonical URL normalizer require a reviewed data migration as well; existing keys must not silently diverge from new submissions.

Migration is an explicit maintenance step:

```sh
# Set MIGRATION_DATABASE_URL securely to the migration owner's connection URL.
npm run db:migrate
```

The runner uses a single connection and transaction, an advisory lock, finite connection/statement/lock timeouts and fail-fast checks. An empty database receives the baseline. A restored database is adopted only after its complete catalog fingerprint matches the baseline. An existing installation retains its original ledger records and receives only pending additive migrations after its current catalog and checksums pass verification. Schema drift, unknown/out-of-order ledger entries, changed SQL checksums or invalid historical URLs abort the entire transaction. Concurrent migration runners serialize. Repeating a completed migration verifies the catalog and performs no data rewrite. The application never invokes migrations on startup.

## Least-privilege roles

The reusable `scripts/db/provision.sql` accepts required psql variables `expected_database` and `phase=roles|grants`. Run it with `psql -X -v ON_ERROR_STOP=1` as the cluster administrator against the explicitly named application database. The roles phase creates missing `tfw_migrator`/`tfw_app` without passwords and rejects unsafe existing roles or app ownership/DDL grants. Assign passwords privately and make the still-empty application database owned by `tfw_migrator` before restoring/migrating as that role. The grants phase requires this ownership and an existing migration ledger, then grants only the explicit runtime permissions below. It never changes passwords, takes over ownership, or migrates automatically. Repeating either valid phase is safe; a wrong database or unsafe role aborts the transaction.

Provision passwords through the PostgreSQL/Coolify secret mechanism; do not commit them or put literal passwords in shell history. Example role and database names follow. Run the initial role/database creation as the cluster administrator in a maintenance console:

```sql
CREATE ROLE tfw_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE tfw_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE DATABASE thefastestweb OWNER tfw_migrator;
REVOKE ALL ON DATABASE thefastestweb FROM PUBLIC;
GRANT CONNECT ON DATABASE thefastestweb TO tfw_migrator, tfw_app;
```

Assign passwords privately, for example with interactive `psql` `\password tfw_migrator` and `\password tfw_app`. Restore and migrate while connected as `tfw_migrator`. After migration, connect to `thefastestweb` as `tfw_migrator` and grant only the runtime permissions:

```sql
GRANT USAGE ON SCHEMA public TO tfw_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.users, public.sites, public.speed_tests, public.speed_checks,
  public.payments, public.ad_slots, public.ad_clicks, public.cron_logs,
  public.verified_speed_tests, public.request_rate_limits,
  public.background_jobs, public.job_events, public.provider_usage,
  public.products, public.checkout_orders, public.payment_ledger, public.payment_events,
  public.subscriptions, public.entitlements, public.notification_preferences,
  public.notifications, public.email_deliveries, public.categories, public.site_categories,
  public.technologies, public.site_technologies, public.founders, public.founder_sites,
  public.founder_social_links, public.site_social_links, public.site_claims,
  public.competition_periods, public.achievements, public.site_awards,
  public.site_screenshots, public.admin_roles, public.ad_inventory, public.ad_reservations,
  public.analytics_events, public.founder_site_invitations TO tfw_app;
GRANT SELECT, INSERT ON public.ranking_snapshots, public.audit_logs TO tfw_app;
GRANT SELECT ON public.ad_clicks_with_names, public.countries TO tfw_app;
GRANT USAGE, SELECT ON SEQUENCE public.ad_slots_id_seq TO tfw_app;
```

The app role must not own tables, inherit the migration role, have `BYPASSRLS`, or receive CREATE/TRUNCATE/role-management privileges. It has no access to `app_meta`. Grant the newly added runtime tables explicitly after each upgrade; no blanket default grants are installed. Snapshot/audit writes need INSERT only; closed snapshots are additionally protected by triggers. Readiness checks required columns, write grants and enabled immutability triggers. Use `DATABASE_URL` for `tfw_app` in web, worker and scheduler processes. Keep `MIGRATION_DATABASE_URL` only in a separate maintenance environment, never in those runtime services.

The original snapshot enables RLS on every table but supplies no policies. M1 deliberately disables that unusable RLS configuration and revokes PUBLIC table/sequence grants and schema CREATE. Access checks therefore belong to authenticated server code. This model requires a private database and careful authorization in every API handler.

## Identity, normalized URLs and trusted results

Every original user/site/test UUID, original URL, owner link, measurement and ad sequence value survives migration. `sites.normalized_url` uses the same pure URL normalizer as submissions; no DNS lookup or HTTP request occurs during migration. One pair of historical sites differs only by a root trailing slash. Both records and their histories are retained with the same canonical key; the migration logs their IDs for private review, never their URLs or user details. There is intentionally a nonunique lookup index. New submissions **must** acquire `pg_advisory_xact_lock(hashtextextended('site-url:' || normalized_url, 0))`, check for any existing canonical key, and insert inside the same transaction. No separate route may bypass that transaction.

Historical speed tests are labeled `legacy-unspecified`; their metrics are not rescored. New server measurements provide their own methodology version. `verified_speed_tests` stores only the validated server result, owner, URL, strategy, job ID and expiry. Its job ID is unique. Consumption must check owner/URL/expiry and `consumed_at IS NULL`, then record consumption, create the site and insert history atomically. A failed transaction must leave the token unconsumed. The schema prevents non-object result JSON and expiry before creation; full result validation is still a server responsibility.

`request_rate_limits` retains the M1 hashed counters for compatibility. M2 shared HTTP/minute quotas use expiring Redis keys. The scheduled `maintenance.cleanup` job removes old database quota windows and proof records expired for more than 30 days; site records and measurement history are never part of this cleanup. The scheduler and worker must both run for automatic maintenance. Deleting a site sets the optional verified-result link to NULL until that evidence record reaches its retention limit.

## Durable jobs and provider usage

`background_jobs` is both the authoritative state and the transactional outbox. Job creation and its audit event commit together before Redis delivery. A unique `job_key` deduplicates a site/day/strategy across producers; the Redis payload contains a job UUID and correlation UUID, not target URLs or user details. Pending/queued rows can be redispatched after Redis loss. The database lease token and expiry fence completion writes from cancelled or replaced workers. Attempts are nonnegative, maximum attempts positive, and the two lease columns must be populated or cleared together. The service explicitly updates timestamps; there are no implicit update triggers.

`job_events` records category labels such as service/owner/operator and safe error codes, never names, email addresses, IPs or raw provider errors. `background_jobs.result` stores a small safe summary. Payload and result columns accept JSON objects only; the service validates each supported kind's full shape.

`speed_tests.background_job_id` is nullable for historical and interactive measurements, unique for background measurements, and references the job with `NO ACTION` deletion semantics. The worker inserts the measurement, updates the site and completes its lease in one transaction. Deleting referenced job evidence is prohibited, so pruning a delivery from Redis cannot remove the database's duplicate barrier. Job event rows cascade only when their unreferenced parent job is deliberately deleted. Site deletion sets the job's optional site link to NULL without erasing the ledger.

`provider_usage` uses `(day, provider)` as its primary key and a nonnegative counter. Every actual PageSpeed request, including a backup-key retry, reserves its daily allowance atomically before network access. The date is computed in PostgreSQL in UTC regardless of session timezone. A Redis reset does not reset this counter. Failed or uncertain provider calls are not refunded. Provider usage and job evidence currently have no automatic pruning policy.

## Pool and checks

M3/M5 adds reference data without inventing product evidence: 249 assigned ISO country codes, the eight original category mappings, and 15 technology names. Existing country flags remain unchanged and new country codes stay NULL until validated input; no site technology, public founder, competition result or screenshot is fabricated. Historical Pro and ad grants use deterministic valid UUIDs for new entitlement records and stable source keys; original IDs remain intact. Founder visibility defaults private. Claims store SHA-256 token hashes with expiry/attempt bounds and never silently transfer an already-owned website.

Ranking and performance rules are in [METHODOLOGY.md](METHODOLOGY.md); award evidence, badge grace and non-destructive checks are in [AWARDS-AND-BADGES.md](AWARDS-AND-BADGES.md). Snapshot trigger bodies are included in the migration fingerprint, not merely their names.

`getDb()` and the compatibility `db` export share one lazy process pool. Defaults: maximum 10 connections, 10-second connect timeout, 20-second idle timeout and 10-second statement timeout. Configure `DB_MAX_CONNECTIONS`, `DB_CONNECT_TIMEOUT_SECONDS`, `DB_IDLE_TIMEOUT_SECONDS`, and `DB_STATEMENT_TIMEOUT_MS` as positive integers. Allow for every replica when sizing the PostgreSQL connection budget. `closeDb()` drains the pool during shutdown.

The integration check requires an explicitly disposable loopback PostgreSQL database whose name begins `tfw_test_`, plus a separate authenticated loopback Redis instance/database 15 configured with AOF and `noeviction`:

```sh
# MIGRATION_TEST_DATABASE_URL points only to that disposable test database.
# REDIS_TEST_URL points only to that disposable Redis database 15.
npm run test:integration
```

It creates uniquely named temporary test databases/roles and removes only those objects. The nine migration check groups verify fresh/restored/M1 upgrade paths, concurrent runners, idempotence, historical identity/data preservation, duplicate retention, invalid URL and schema-drift rollback, checksum tampering, job constraints, and a non-superuser app role that can use data but cannot create tables or read the migration ledger. Application integration cases use that same privilege model to exercise submissions, ownership, job transitions and quota persistence. Eight provider-budget cases additionally cover concurrent cap enforcement, reconnects, UTC day boundaries and fail-closed behavior. Redis tests use unique prefixes and delete only their own keys/queues. Badge and PageSpeed providers are mocked; these tests make no public network requests.

References: [PostgreSQL restore](https://www.postgresql.org/docs/18/backup-dump.html), [RLS semantics](https://www.postgresql.org/docs/18/ddl-rowsecurity.html), [postgres.js connection options](https://github.com/porsager/postgres#connection-details).
