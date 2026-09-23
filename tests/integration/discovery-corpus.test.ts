import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
import { countPublicSites, listPublicSiteRecords } from "../../src/modules/seo/public-corpus";
import { sitemapDocument, sitemapIndex } from "../../src/modules/seo/sitemaps";
import { referencePart, referenceCatalog } from "../../src/modules/seo/reference-corpus";

beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => { await resetIntegrationData(); vi.stubEnv("SITE_URL", "https://example.invalid"); vi.stubEnv("DEPLOYMENT_MODE", "production"); });
afterEach(() => vi.unstubAllEnvs());
describe("public discovery pagination on PostgreSQL", () => {
  it("exports 401 unique public records in 200/200/1 parts and excludes every nonpublic lifecycle", async () => {
    const sql = fixtureSql();
    const publicRows = Array.from({ length: 401 }, (_, index) => ({ id: randomUUID(), slug: `visible-${index}`, name: `Published ${index}`,
      url: `https://public.invalid/${index}`, normalized_url: `https://public.invalid/${index}`, description: `Published description ${index}`,
      owner_name: "Never export account attribution", is_listed: true, lifecycle: index % 2 ? "active" : "verified" }));
    await sql`INSERT INTO sites ${sql(publicRows)}`;
    const hidden = ["submitted", "pending", "removed", "unreachable", "redirected", "parked", "suspended", "archived"];
    for (const lifecycle of hidden) {
      await sql`INSERT INTO sites(slug,name,url,normalized_url,description,owner_name,is_listed,lifecycle)
        VALUES(${`hidden-${lifecycle}`},'Hidden',${`https://hidden.invalid/${lifecycle}`},${`https://hidden.invalid/${lifecycle}`},'Private unpublished description','Private owner',true,${lifecycle})`;
    }
    await sql`INSERT INTO sites(slug,name,url,normalized_url,description,owner_name,is_listed,lifecycle,archived_at)
      VALUES('hidden-archived-flag','Hidden','https://hidden.invalid/archived-flag','https://hidden.invalid/archived-flag','Private unpublished description','Private owner',true,'active',now()),
      ('hidden-unlisted','Hidden','https://hidden.invalid/unlisted','https://hidden.invalid/unlisted','Private unpublished description','Private owner',false,'active',null)`;
    expect(await countPublicSites()).toBe(401);
    const records = await Promise.all([0, 1, 2].map(listPublicSiteRecords));
    expect(records.map((page) => page.length)).toEqual([200, 200, 1]);
    expect(new Set(records.flat().map((row) => row.slug)).size).toBe(401);
    expect(JSON.stringify(records)).not.toMatch(/owner_name|ownerId|Never export|Private unpublished|hidden-/);
    const xml = await sitemapIndex();
    expect(xml).toContain("/sitemap-sites-3.xml"); expect(xml).not.toContain("/sitemap-sites-4.xml");
    for (const [page, expected] of [[0, 200], [1, 200], [2, 1]]) {
      expect((await sitemapDocument("sites", page)).match(/<url>/g)).toHaveLength(expected);
      expect((await referencePart("sites", page))!.body.match(/Canonical report:/g)).toHaveLength(expected);
    }
    await expect(sitemapDocument("sites", 3)).rejects.toMatchObject({ status: 404 });
    expect(await referencePart("sites", 3)).toBeNull();
    expect((await referenceCatalog()).body).toContain("Published website records: 401");
  });
  it("discovers canonical public founders only, excluding private founder and account details", async () => {
    const sql = fixtureSql(), owner = randomUUID();
    await sql`INSERT INTO users(id,email,name) VALUES(${owner},'never-public@example.invalid','Never public account name')`;
    await sql`INSERT INTO founders(slug,name,bio,visibility,user_id) VALUES('public-person','Published person','Published biography','public',${owner}),
      ('private-person','Secret person','Private biography','private',null)`;
    const xml = await sitemapDocument("founders", 0);
    const part = (await referencePart("founders", 0))!.body;
    expect(xml).toContain("/founder/public-person"); expect(part).toContain("Published biography");
    expect(xml + part).not.toMatch(/private-person|Secret person|Private biography|never-public@example|Never public account|\/profile\//);
    expect(xml + part).not.toContain(owner);
  });
});
