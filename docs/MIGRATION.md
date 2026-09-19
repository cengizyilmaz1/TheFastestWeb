# Restore the private snapshot and apply M1

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

5. Set `MIGRATION_DATABASE_URL` in the maintenance environment and run `npm run db:migrate`. The runner fingerprints the restored schema, adopts the baseline only if it matches, then applies M1 and URL normalization in a transaction. **Do not** run the baseline SQL manually over restored tables. An unexpected schema or invalid historical URL aborts without partial DDL/data changes. A known canonical duplicate pair is retained and reported for review; no records or test histories are merged.
6. Repeat the row counts and compare ownership/UUID/history integrity. Expect 187 populated canonical URL keys and all 17,595 historical tests labeled `legacy-unspecified`. Both new M1 tables start empty. Grant app-role permissions, use its URL for the web process, and run readiness, Google sign-in, site ownership and submission checks. Start scheduled jobs only after the new database is the agreed source of truth.

Fresh installations without a private export run the same migration command against an empty database. The runner creates an empty baseline; it never inserts demonstration sites or users.

## Verified local rehearsal

The reviewed dump was restored into an isolated PostgreSQL 18.6 container with no external network or published ports. The guarded migration preserved the aggregate integrity fingerprints of **all original column values in all eight tables** and the ad slot sequence. Counts remained 444 users, 187 sites and 17,595 historical tests. The canonical duplicate pair was retained; no original URLs, UUIDs, ownership links or metrics changed. Separate synthetic integration databases cover error handling and least-privilege application access.

This proves the local export and migrations, not access to the former production accounts. Google OAuth credentials and callback URLs, email delivery, Polar merchant products/subscriptions, domain/DNS, and Coolify secrets still require independent configuration. A SQL restore does not transfer those accounts. In this snapshot, payment rows are empty and full speed-test `raw_response` payloads are NULL; neither can be reconstructed from missing data.
