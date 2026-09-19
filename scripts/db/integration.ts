import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { migrateDatabase } from "./migrate";

// Run only against an explicitly disposable PostgreSQL container. No production defaults.
async function main(): Promise<void> {
  const connection = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!connection) throw new Error("MIGRATION_TEST_DATABASE_URL is required for isolated database tests");
  const address = new URL(connection);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(address.hostname) || !address.pathname.startsWith("/tfw_test_")) {
    throw new Error("Database tests require a loopback host and a tfw_test_ database");
  }
  const control = postgres(connection, { max: 1, onnotice: () => undefined });
  const baseline = await readFile(new URL("../../src/db/migrations/0000_snapshot_baseline.sql", import.meta.url), "utf8");
  const suffix = randomBytes(6).toString("hex");
  const databases: string[] = [];
  const clients: ReturnType<typeof postgres>[] = [];
  const roles: string[] = [];
  const userId = "00000000-0000-4000-8000-000000000011";
  const siteId = "00000000-0000-4000-8000-000000000012";
  const speedId = "00000000-0000-4000-8000-000000000013";

  async function isolated(label: string) {
    const name = `tfw_test_${suffix}_${label}`;
    await control`CREATE DATABASE ${control(name)}`;
    databases.push(name);
    const url = new URL(connection!);
    url.pathname = `/${name}`;
    const sql = postgres(url.toString(), { max: 1, onnotice: () => undefined });
    clients.push(sql);
    return { name, url: url.toString(), sql };
  }

  async function fixture(sql: ReturnType<typeof postgres>) {
    await sql.unsafe(baseline);
    await sql`INSERT INTO public.users (id,email,name) VALUES (${userId}, 'fixture@example.invalid', 'Synthetic fixture')`;
    await sql`INSERT INTO public.sites (id,slug,name,url,description,owner_id,owner_name)
      VALUES (${siteId}, 'fixture', 'Synthetic site', 'https://example.com', 'Fixture', ${userId}, 'Synthetic owner')`;
    await sql`INSERT INTO public.speed_tests (id,site_id,score,lcp_ms) VALUES (${speedId},${siteId},87,1240)`;
  }

  try {
    const fresh = await isolated("fresh");
    await Promise.all([1, 2].map(() => migrateDatabase({ databaseUrl: fresh.url, log: () => undefined })));
    const [state] = await fresh.sql`SELECT
      (SELECT count(*) FROM app_meta.schema_migrations)::integer AS migrations,
      (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity)::integer AS rls,
      (SELECT count(*) FROM public.verified_speed_tests)::integer AS verified`;
    assert.deepEqual({ ...state }, { migrations: 2, rls: 0, verified: 0 });
    console.log("PASS fresh database, concurrent runners, idempotence, and final RLS state");

    const restored = await isolated("restored");
    await fixture(restored.sql);
    await migrateDatabase({ databaseUrl: restored.url, log: () => undefined });
    const [kept] = await restored.sql`SELECT s.id,s.url,s.owner_id,s.normalized_url,t.id AS test_id,t.score,t.lcp_ms,t.methodology_version
      FROM public.sites s JOIN public.speed_tests t ON t.site_id=s.id`;
    assert.deepEqual({ ...kept }, { id: siteId, url: "https://example.com", owner_id: userId,
      normalized_url: "https://example.com/", test_id: speedId, score: 87, lcp_ms: 1240, methodology_version: "legacy-unspecified" });
    await migrateDatabase({ databaseUrl: restored.url, log: () => undefined });
    console.log("PASS restored baseline adoption preserves UUIDs, ownership, URL, score and history");

    const drift = await isolated("drift");
    await drift.sql.unsafe(baseline);
    await drift.sql`ALTER TABLE public.users ADD COLUMN unexpected_column text`;
    await assert.rejects(migrateDatabase({ databaseUrl: drift.url, log: () => undefined }), /Schema fingerprint mismatch/);
    const [notAdopted] = await drift.sql`SELECT to_regnamespace('app_meta') IS NULL AS unchanged`;
    assert.equal(notAdopted.unchanged, true);
    console.log("PASS schema drift rejected without falsely adopting baseline");

    const collision = await isolated("collision");
    await fixture(collision.sql);
    await collision.sql`INSERT INTO public.sites (slug,name,url,description,owner_id,owner_name)
      VALUES ('duplicate', 'Synthetic duplicate', 'https://example.com/', 'Fixture', ${userId}, 'Synthetic owner')`;
    const collisionLogs: string[] = [];
    await migrateDatabase({ databaseUrl: collision.url, log: (message) => collisionLogs.push(message) });
    const [preserved] = await collision.sql`SELECT count(*)::integer AS sites,
      count(DISTINCT normalized_url)::integer AS canonical_urls FROM public.sites`;
    assert.deepEqual({ ...preserved }, { sites: 2, canonical_urls: 1 });
    assert.ok(collisionLogs.some((message) => message.startsWith("Preserved 1 historical canonical duplicates")));
    console.log("PASS historical canonical duplicates retain both sites and receive identical canonical keys");

    const invalid = await isolated("invalid");
    await fixture(invalid.sql);
    await invalid.sql`UPDATE public.sites SET url='http://127.0.0.1/' WHERE id=${siteId}`;
    await assert.rejects(migrateDatabase({ databaseUrl: invalid.url, log: () => undefined }), /1 invalid URLs/);
    console.log("PASS invalid historical URL requires review instead of silent rewriting");

    await fresh.sql`UPDATE app_meta.schema_migrations SET checksum='changed' WHERE version='0000_snapshot_baseline'`;
    await assert.rejects(migrateDatabase({ databaseUrl: fresh.url, log: () => undefined }), /Migration ledger/);
    console.log("PASS edited migration ledger is rejected");

    const role = `tfw_test_${suffix}_app`;
    await control`CREATE ROLE ${control(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`;
    roles.push(role);
    await restored.sql`GRANT USAGE ON SCHEMA public TO ${restored.sql(role)}`;
    await restored.sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${restored.sql(role)}`;
    await restored.sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${restored.sql(role)}`;
    const appUrl = new URL(restored.url);
    appUrl.username = role;
    appUrl.password = "";
    const app = postgres(appUrl.toString(), { max: 1, onnotice: () => undefined });
    clients.push(app);
    const [visible] = await app`SELECT count(*)::integer AS users FROM public.users`;
    assert.equal(visible.users, 1);
    await app`UPDATE public.users SET last_active_at=now() WHERE id=${userId}`;
    await assert.rejects(app`CREATE TABLE public.forbidden (id integer)`, { code: "42501" });
    await assert.rejects(app`SELECT * FROM app_meta.schema_migrations`, { code: "42501" });
    console.log("PASS non-superuser app role can use data but cannot create tables or access migration ledger");
  } finally {
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
    for (const name of databases) await control`DROP DATABASE ${control(name)} WITH (FORCE)`;
    for (const role of roles) await control`DROP ROLE ${control(role)}`;
    await control.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database integration checks failed");
  process.exitCode = 1;
});
