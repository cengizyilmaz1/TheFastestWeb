# Restore the private snapshot and apply reviewed migrations

The original `fastestweb/thefastestweb-db-dump.sql` and bundle remain outside this repository. Do not commit the export, prepared copy, restore logs containing row errors, credentials, or private backup artifacts. This guide supersedes the old archive guide's PostgreSQL 15+ claim and obsolete Drizzle migration.

The reviewed export came from PostgreSQL 17.6 using pg_dump 18.6. Use PostgreSQL 18 and a current `psql` 18 client. The original SHA-256 is:

```text
79474792d88c1391e71f42b1a4a8628b74870b6460b1a9e2353b65bb1b1202ba
```

1. Provision an **empty** private database and the separate migration/application roles described in [DATABASE.md](DATABASE.md). Stop writers during the cutover and take a separately stored backup. Do not run old and new cron/retest processes concurrently against different authoritative databases.
2. Prepare a separate private import copy. The helper validates the known source checksum, refuses to overwrite a file, and refuses an output path inside this Git repository. Its sole SQL change is `CREATE SCHEMA public` to `CREATE SCHEMA IF NOT EXISTS public` to support the already existing default schema. Original bytes are preserved.

   ```sh
   npx tsx scripts/db/prepare-dump.ts /private/thefastestweb-db-dump.sql /private/thefastestweb-restore.sql
   ```

3. Restore the copy as the migration owner, with fail-fast behavior and one transaction. Supply the connection securely through standard PostgreSQL environment/service settings; do not paste credentials into this document.

   ```sh
   psql -X --set=ON_ERROR_STOP=1 --single-transaction -f /private/thefastestweb-restore.sql
   ```

4. Verify the exact snapshot totals before migration:

   | Table | Expected rows |
   |---|---:|
   | users | 444 |
   | sites | 187 |
   | speed_tests | 17,595 |
   | speed_checks | 1,262 |
   | ad_clicks | 202 |
   | ad_slots | 7 |
   | cron_logs | 1 |
   | payments | 0 |

   The ad slot sequence must have `last_value = 8` and `is_called = true`. All six historical foreign keys must validate. No source primary key is regenerated.

5. Set `MIGRATION_DATABASE_URL` in the maintenance environment and run `npm run db:migrate`. The runner fingerprints the restored schema, adopts the baseline only if it matches, then applies pending migrations through `0006_domain_analytics` in a transaction. **Do not** run the baseline SQL manually over restored tables. An unexpected schema or invalid historical URL aborts without partial DDL/data changes. A known canonical duplicate pair is retained and reported for review; no records or test histories are merged.
6. Repeat the row counts and compare ownership/UUID/history integrity. Expect 187 populated canonical URL keys and all 17,595 historical tests labeled `legacy-unspecified`, with NULL background-job references and sample count 1. The reviewed original dump creates 122 legacy entitlement grants, 187 category links and five distinct observed ad inventory positions; no provider payment, reservation, technology attribution, founder, ranking or analytics event is fabricated. The migration ledger has seven entries. Grant app-role permissions, use its URL for the web/worker/scheduler processes, and run readiness, Google sign-in, site ownership and submission checks. Enable scheduled generation only after the new database is the agreed source of truth; the dispatcher can run independently with generation disabled.

Fresh installations without a private export run the same migration command against an empty database. The runner creates an empty baseline; it never inserts demonstration sites or users.

## Upgrade an existing installation

Take a backup and pause writers/jobs for the maintenance window. Run the current `npm run db:migrate` with the existing migration owner's URL. The runner verifies the current catalog and all recorded checksums, preserves those ledger records and timestamps, and applies only pending migrations: M1 receives `0002`–`0006`; M2 receives `0003`–`0006`; M3/M5 receives `0005`–`0006`. Do not restore the original dump or re-adopt the baseline. Existing migration SQL/checksums are never regenerated. Grant all new runtime tables using [DATABASE.md](DATABASE.md); readiness rejects missing schema or permissions. Existing IDs, ownership, measurements and sequence state remain unchanged. Deploy matching web/worker/scheduler images, then enable generation after readiness passes. Provider integrations stay disabled until independently configured; legacy grants do not depend on a new payment account.

## Verified local rehearsal

The reviewed dump was restored into an isolated PostgreSQL 18.6 container with no external network or published ports. The guarded M1 migration preserved the aggregate integrity fingerprints of **all original column values in all eight tables** and the ad slot sequence. The M2 rehearsal first used the committed M1 runner, then upgraded with the current runner: all existing column values across the ten M1 tables, the sequence and both original ledger records/timestamps had identical before/after hashes. Only the additive M2 migration was applied. Counts remained 444 users, 187 sites and 17,595 historical tests, with no historical background-job links. The canonical duplicate pair was retained; no original URLs, UUIDs, ownership links or metrics changed. Separate synthetic integration databases cover error handling and least-privilege application access.

The M3/M5 rehearsal restored the same private dump, ran the committed M2 migration runner, then applied only `0003`/`0004`. Every original column value across all 13 M2 tables, the ad sequence, and all three old migration records/timestamps remained hash-identical. Counts remained 444/187/17,595. The resulting 122 legacy grants preserved every existing Pro flag and ad owner/expiry, and all 187 sites received their original category link. Country assignments, site technologies, founders and ranking snapshots remained empty. Repeating the migration verified all five checksums/catalogs and performed no writes.

The subsequent `0005` rehearsal preserved the complete row hashes of all 39 pre-existing public tables and all five prior migration records. Exactly five observed ad position/order pairs became inventory; reservations remained empty. Repeating the six-migration runner performed no writes. Synthetic tests verify one winner under concurrent reservation attempts, persistent uncertain holds, complete active date windows, restricted parent deletion and readiness failure when a runtime reservation grant is removed.

The `0006` upgrade likewise preserved complete hashes across all 41 pre-existing public tables and all six prior ledger records. The new analytics table was empty; the seven-migration repeat was a verified no-op. The reusable role provisioning script passed roles/grants/repeat, wrong-database and unsafe-existing-role cases. A separate synthetic PostgreSQL 18 custom backup was restored into a new isolated database and matched every captured table/sequence aggregate; an intentional row insertion made verification fail without exposing its data.

## Backup integrity checks

Pause application/worker/scheduler writers, then use PostgreSQL 18 `pg_dump --format=custom --no-owner --no-acl --file=/private/backup.dump` with a private `PGSERVICE`/`PGPASSFILE` or equivalent maintenance environment. Never put credentials in command arguments or backup files in Git. With `MIGRATION_DATABASE_URL` pointing privately to the same database, capture a manifest:

```sh
npx tsx scripts/db/integrity.ts capture /private/backup-integrity.json
```

The read-only repeatable-read transaction computes SHA-256 aggregates of every row in public/application-migration tables, row counts, and sequence values. It exports no individual data rows. Writers must remain paused because sequence changes are not MVCC-isolated. Capture refuses an existing output and any path inside the repository.

Restore the custom archive into a newly created isolated empty database owned by the migration role, using `pg_restore --exit-on-error --single-transaction --no-owner --no-acl`; never use `--clean` against an existing application database. Set `MIGRATION_DATABASE_URL` privately to that restored database and run `npx tsx scripts/db/integrity.ts verify /private/backup-integrity.json` **before** applying new migrations. A mismatch fails without writing to the database. The maintenance migration image contains these scripts; the environment running pg_dump/pg_restore must supply PostgreSQL 18 client binaries. The original SQL snapshot instead follows the reviewed prepare-dump procedure above.

This proves the local export and migrations, not access to the former production accounts. Google OAuth credentials and callback URLs, email delivery, Polar merchant products/subscriptions, domain/DNS, and Coolify secrets still require independent configuration. A SQL restore does not transfer those accounts. In this snapshot, payment rows are empty and full speed-test `raw_response` payloads are NULL; neither can be reconstructed from missing data.
