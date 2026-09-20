import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../scripts/db/migrate";
import { categorySlugs, indieCategorySlugs, legacyCategorySlugs } from "../../src/modules/catalog/categories";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase } from "./database";

beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);

describe("additive IndieTools reference-data migration", () => {
  it("seeds all 23 choices without extending the historical category enum", async () => {
    const sql = fixtureSql();
    const rows = await sql`SELECT slug FROM public.categories ORDER BY slug`;
    expect(rows.map((row) => row.slug)).toEqual([...categorySlugs].sort());
    const values = await sql`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      WHERE t.typname='category' ORDER BY e.enumsortorder`;
    expect(values.map((row) => row.enumlabel)).toEqual([...legacyCategorySlugs]);
  });

  it("preserves old IDs, assignments, history and an operator's inactive category on upgrade and replay", async () => {
    const sql = fixtureSql();
    // Reconstruct the valid pre-0008 reference-data state only inside this
    // newly generated tfw_test_ database. The schema is unchanged by 0008.
    await sql`DELETE FROM public.categories WHERE slug IN ${sql([...indieCategorySlugs])}`;
    await sql`DELETE FROM app_meta.schema_migrations WHERE version='0008_indietools_categories'`;
    const owner = randomUUID(), site = randomUUID(), customCategory = randomUUID();
    await sql`INSERT INTO public.users(id,email,name) VALUES(${owner},'category-fixture@example.invalid','Category fixture')`;
    await sql`INSERT INTO public.sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,category,is_listed,lifecycle)
      VALUES(${site},'category-fixture','Category fixture','https://example.invalid/','https://example.invalid/','Synthetic fixture',${owner},'Category fixture','tool',true,'active')`;
    await sql`INSERT INTO public.speed_tests(site_id,score,lcp_ms) VALUES(${site},88,1200)`;
    await sql`INSERT INTO public.categories(id,slug,name,active) VALUES(${customCategory},'ai','Operator curated AI',false)`;
    await sql`INSERT INTO public.site_categories(site_id,category_id,is_primary)
      SELECT ${site},id,true FROM public.categories WHERE slug='tool'`;
    const before = await sql`SELECT
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.categories c) AS categories,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.sites s) AS sites,
      (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.users u) AS users,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.speed_tests t) AS tests,
      (SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.site_id,sc.category_id) FROM public.site_categories sc) AS assignments,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.version) FROM app_meta.schema_migrations m) AS ledger`;
    const [{ name }] = await sql`SELECT current_database() AS name`;
    const ownerUrl = new URL(process.env.MIGRATION_TEST_DATABASE_URL!);
    ownerUrl.pathname = `/${name}`;
    const messages: string[] = [];
    await migrateDatabase({ databaseUrl: ownerUrl.toString(), log: (message) => messages.push(message) });
    expect(messages).toEqual(["Applied 0008_indietools_categories."]);
    const after = await sql`SELECT
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.categories c WHERE c.slug NOT IN ${sql([...indieCategorySlugs].filter((slug) => slug !== "ai"))}) AS categories,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.sites s) AS sites,
      (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.users u) AS users,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.speed_tests t) AS tests,
      (SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.site_id,sc.category_id) FROM public.site_categories sc) AS assignments,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.version) FROM app_meta.schema_migrations m WHERE m.version<'0008') AS ledger`;
    expect(after).toEqual(before);
    const captured = await sql`SELECT to_jsonb(c) AS value FROM public.categories c ORDER BY c.id`;
    expect(captured).toHaveLength(23);
    await migrateDatabase({ databaseUrl: ownerUrl.toString(), log: () => undefined });
    const source = await readFile(new URL("../../src/db/migrations/0008_indietools_categories.sql", import.meta.url), "utf8");
    await sql.unsafe(source);
    await sql.unsafe(source);
    expect(await sql`SELECT to_jsonb(c) AS value FROM public.categories c ORDER BY c.id`).toEqual(captured);
    expect((await sql`SELECT id,name,active FROM public.categories WHERE slug='ai'`)[0])
      .toEqual({ id: customCategory, name: "Operator curated AI", active: false });
  });
});
