import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { normalizePublicUrl } from "../../src/lib/security/public-url";

const migrationsDirectory = new URL("../../src/db/migrations/", import.meta.url);
const versions = ["0000_snapshot_baseline", "0001_m1_verified_results", "0002_m2_job_ledger", "0003_m3_providers", "0004_m5_product_model", "0005_ad_inventory", "0006_domain_analytics", "0007_founder_invitations", "0008_indietools_categories"] as const;
type Catalog = Record<string, unknown[]>;
type MigrationOptions = { databaseUrl: string; log?: (message: string) => void };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertCatalog(actual: Catalog, expected: Catalog, version: string): void {
  if (canonical(actual) !== canonical(expected)) {
    throw new Error(`Schema fingerprint mismatch for ${version}; database unchanged. Expected ${digest(canonical(expected))}, received ${digest(canonical(actual))}. Review schema drift before migration.`);
  }
}

/** Explicit maintenance operation. Never imported or run by application startup. */
export async function migrateDatabase({ databaseUrl, log = console.log }: MigrationOptions): Promise<void> {
  const parsedUrl = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error("MIGRATION_DATABASE_URL must be a PostgreSQL connection URL");
  }
  const migrations = await Promise.all(versions.map(async (version) => {
    // Git checkout line endings differ between Windows and Linux; SQL identity must not.
    const source = (await readFile(new URL(`${version}.sql`, migrationsDirectory), "utf8")).replace(/\r\n/g, "\n");
    const expected = JSON.parse(await readFile(new URL(`meta/${version}.json`, migrationsDirectory), "utf8")) as Catalog;
    return { version, source, checksum: digest(source), expected };
  }));
  const fingerprintQuery = await readFile(new URL("./fingerprint.sql", import.meta.url), "utf8");
  const client = postgres(databaseUrl, {
    max: 1, connect_timeout: 10, idle_timeout: 5,
    connection: { application_name: "thefastestweb-migration", statement_timeout: 120_000, lock_timeout: 10_000 },
    onnotice: () => undefined,
  });
  const messages: string[] = [];
  try {
    await client.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(20260919, 17001)`;
      await tx`SET LOCAL search_path TO pg_catalog`;
      const [server] = await tx`SELECT current_setting('server_version_num')::integer AS version`;
      if (Number(server.version) < 180000) {
        throw new Error("These reviewed migration fingerprints require PostgreSQL 18 or newer; validate other versions separately.");
      }
      const inspect = async () => {
        const [row] = await tx.unsafe(fingerprintQuery);
        return row.fingerprint as Catalog;
      };
      await tx`CREATE SCHEMA IF NOT EXISTS app_meta`;
      await tx`REVOKE ALL ON SCHEMA app_meta FROM PUBLIC`;
      await tx`CREATE TABLE IF NOT EXISTS app_meta.schema_migrations (
        version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
      )`;
      const recorded = await tx<{ version: string; checksum: string }[]>`
        SELECT version, checksum FROM app_meta.schema_migrations ORDER BY version
      `;
      if (recorded.length > migrations.length || recorded.some((row, i) => row.version !== migrations[i]?.version || row.checksum !== migrations[i]?.checksum)) {
        throw new Error("Migration ledger is unknown, out of order, or its checksums differ; database unchanged.");
      }

      let next = recorded.length;
      if (next === 0) {
        const catalog = await inspect();
        const empty = Object.values(catalog).every((objects) => objects.length === 0);
        if (empty) {
          await tx.unsafe(migrations[0].source);
          assertCatalog(await inspect(), migrations[0].expected, migrations[0].version);
          messages.push("Created empty snapshot baseline.");
        } else {
          assertCatalog(catalog, migrations[0].expected, migrations[0].version);
          messages.push("Adopted existing snapshot only after complete schema fingerprint matched.");
        }
        await tx`INSERT INTO app_meta.schema_migrations (version, checksum) VALUES (${migrations[0].version}, ${migrations[0].checksum})`;
        next = 1;
      } else {
        assertCatalog(await inspect(), migrations[next - 1].expected, migrations[next - 1].version);
      }
      for (let i = next; i < migrations.length; i++) {
        const migration = migrations[i];
        await tx.unsafe(migration.source);
        if (migration.version === "0001_m1_verified_results") {
          const legacySites = await tx<{ id: string; url: string }[]>`SELECT id, url FROM public.sites ORDER BY id`;
          const normalized = new Map<string, string[]>();
          const backfill: { id: string; url: string }[] = [];
          let invalid = 0;
          let collisions = 0;
          for (const site of legacySites) {
            try {
              const url = normalizePublicUrl(site.url);
              const ids = normalized.get(url) ?? [];
              if (ids.length) collisions++;
              ids.push(site.id);
              normalized.set(url, ids);
              backfill.push({ id: site.id, url });
            } catch {
              invalid++;
            }
          }
          if (invalid) {
            throw new Error(`Legacy URL normalization blocked: ${invalid} invalid URLs. Database unchanged; resolve in a reviewed maintenance plan.`);
          }
          for (const site of backfill) {
            await tx`UPDATE public.sites SET normalized_url = ${site.url} WHERE id = ${site.id}`;
          }
          await tx`ALTER TABLE public.sites ALTER COLUMN normalized_url SET NOT NULL`;
          messages.push(`Backfilled ${backfill.length} canonical URL keys; original URLs and IDs preserved.`);
          if (collisions) {
            const duplicateIds = [...normalized.values()].filter((ids) => ids.length > 1).flat().sort();
            messages.push(`Preserved ${collisions} historical canonical duplicates; no sites merged or removed. Review site IDs: ${duplicateIds.join(", ")}.`);
          }
        }
        assertCatalog(await inspect(), migration.expected, migration.version);
        await tx`INSERT INTO app_meta.schema_migrations (version, checksum) VALUES (${migration.version}, ${migration.checksum})`;
        messages.push(`Applied ${migration.version}.`);
      }
      if (messages.length === 0) messages.push("Schema fingerprints and migration checksums match; no pending migrations.");
    });
    for (const message of messages) log(message);
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.argv[1] && /(?:^|[/\\])migrate\.(?:ts|mjs)$/.test(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl) {
    console.error("MIGRATION_DATABASE_URL is required. Use the migration owner, never application startup.");
    process.exitCode = 1;
  } else {
    migrateDatabase({ databaseUrl }).catch((error: unknown) => {
      // Driver details can contain row values or connection details; expose only reviewed errors.
      const message = error instanceof Error ? error.message : "Migration failed";
      console.error(/^(Schema fingerprint|Migration ledger|These reviewed|MIGRATION_DATABASE_URL|Legacy URL normalization)/.test(message)
        ? message : "Database migration failed and was rolled back. Inspect the database privately.");
      process.exitCode = 1;
    });
  }
}
