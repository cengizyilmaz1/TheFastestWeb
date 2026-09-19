import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db";
import { checkDatabaseReadiness } from "../../src/infrastructure/health/readiness";
import { getCatalog, setSiteTaxonomy } from "../../src/modules/catalog/service";
import { getPublicFounder, linkFounderSite, saveFounderProfile } from "../../src/modules/founders/service";
import { issueSiteClaim, verifySiteClaim } from "../../src/modules/claims/service";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const { fetchProof, resolveTarget, txt } = vi.hoisted(() => ({ fetchProof: vi.fn(), resolveTarget: vi.fn(), txt: vi.fn() }));
vi.mock("../../src/lib/security/safe-fetch", () => ({ safeFetchText: fetchProof }));
vi.mock("../../src/lib/security/public-url", async (original) => ({
  ...await original<typeof import("../../src/lib/security/public-url")>(), resolvePublicTarget: resolveTarget,
}));
vi.mock("node:dns/promises", async (original) => ({
  ...await original<typeof import("node:dns/promises")>(),
  Resolver: class { resolveTxt = txt; cancel() {} },
}));

let ownerId: string;
let otherId: string;
let siteId: string;

beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => {
  await resetIntegrationData();
  ownerId = randomUUID(); otherId = randomUUID(); siteId = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES
    (${ownerId},'owner@example.invalid','Synthetic owner'),(${otherId},'other@example.invalid','Other synthetic user')`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_name,owner_id,is_listed,lifecycle)
    VALUES(${siteId},'synthetic-product','Synthetic product','https://example.com/','https://example.com/','Fixture','Synthetic owner',${ownerId},true,'active')`;
  fetchProof.mockReset().mockResolvedValue({ html: "missing" });
  resolveTarget.mockReset().mockResolvedValue({ url: new URL("https://example.com/"), address: { address: "93.184.216.34", family: 4 } });
  txt.mockReset().mockResolvedValue([]);
});

describe("product catalog and founder privacy", () => {
  it("seeds reference catalogs without inventing a site's country or technology", async () => {
    const catalog = await getCatalog();
    expect(catalog.countries).toHaveLength(249);
    expect(catalog.categories).toHaveLength(8);
    expect(catalog.technologies).toHaveLength(15);
    const [row] = await fixtureSql()`SELECT country_code,(SELECT count(*)::integer FROM site_technologies) AS detected FROM sites WHERE id=${siteId}`;
    expect({ ...row }).toEqual({ country_code: null, detected: 0 });
  });

  it("atomically validates owner and taxonomy selections before replacing them", async () => {
    const catalog = await getCatalog();
    const input = { categoryIds: catalog.categories.slice(0,2).map((x) => x.id), technologyIds: [catalog.technologies[0].id], countryCode: "TR" };
    await setSiteTaxonomy(ownerId, siteId, input);
    await expect(setSiteTaxonomy(otherId, siteId, input)).rejects.toMatchObject({ status: 404 });
    await expect(setSiteTaxonomy(ownerId, siteId, { ...input, countryCode: "ZZ" })).rejects.toMatchObject({ status: 400 });
    await expect(setSiteTaxonomy(ownerId, siteId, { ...input, technologyIds: [randomUUID()] })).rejects.toMatchObject({ status: 400 });
    const [rows] = await fixtureSql()`SELECT
      (SELECT count(*)::integer FROM site_categories WHERE site_id=${siteId}) AS categories,
      (SELECT count(*)::integer FROM site_categories WHERE site_id=${siteId} AND is_primary) AS primary,
      (SELECT count(*)::integer FROM site_technologies WHERE site_id=${siteId}) AS technologies,
      (SELECT country_code FROM sites WHERE id=${siteId}) AS country`;
    expect({ ...rows }).toEqual({ categories: 2, primary: 1, technologies: 1, country: "TR" });
  });

  it("keeps profiles private until explicitly published and excludes account identifiers", async () => {
    const profile = { slug: "synthetic-founder", name: "Synthetic founder", countryCode: "TR" };
    const created = await saveFounderProfile(ownerId, profile);
    await linkFounderSite(ownerId, created.id, siteId);
    expect(await getPublicFounder(profile.slug)).toBeNull();
    await saveFounderProfile(ownerId, { ...profile, visibility: "public", socialLinks: [{ platform: "github", url: "https://github.com/synthetic" }] });
    const visible = await getPublicFounder(profile.slug);
    expect(visible?.sites).toHaveLength(1);
    expect(visible?.socialLinks).toHaveLength(1);
    expect(visible).not.toHaveProperty("userId");
    expect(visible).not.toHaveProperty("email");
    await fixtureSql()`UPDATE sites SET archived_at=now(),lifecycle='archived' WHERE id=${siteId}`;
    expect((await getPublicFounder(profile.slug))?.sites).toHaveLength(0);
  });

  it("prevents profile slug takeover and attribution across accounts", async () => {
    const founder = await saveFounderProfile(ownerId, { slug: "reserved-founder", name: "Owner" });
    await expect(saveFounderProfile(otherId, { slug: "reserved-founder", name: "Other" })).rejects.toMatchObject({ status: 409 });
    await expect(linkFounderSite(otherId, founder.id, siteId)).rejects.toMatchObject({ status: 404 });
    await expect(saveFounderProfile(ownerId, { slug: "reserved-founder", name: "Owner", websiteUrl: "javascript:alert(1)" })).rejects.toBeDefined();
  });
});

describe("bounded ownership proofs", () => {
  it("stores only a token hash and gives an unowned listing to the verified user once", async () => {
    await fixtureSql()`UPDATE sites SET owner_id=NULL WHERE id=${siteId}`;
    const claim = await issueSiteClaim(otherId, { siteId, method: "well_known" });
    const [stored] = await fixtureSql()`SELECT token_hash,expires_at>now() AS active FROM site_claims WHERE id=${claim.id}`;
    expect(stored.token_hash).not.toBe(claim.token);
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.active).toBe(true);
    fetchProof.mockResolvedValue({ html: claim.verification.recordValue });
    await expect(verifySiteClaim(otherId, { claimId: claim.id, token: claim.token })).resolves.toMatchObject({ status: "verified", requiresReview: false });
    const [site] = await fixtureSql()`SELECT owner_id FROM sites WHERE id=${siteId}`;
    expect(site.owner_id).toBe(otherId);
    await expect(verifySiteClaim(otherId, { claimId: claim.id, token: claim.token })).rejects.toMatchObject({ status: 409 });
    expect(fetchProof).toHaveBeenCalledTimes(1);
    expect(fetchProof.mock.calls[0][1]).toMatchObject({ maxRedirects: 0, maxBytes: 4096, timeoutMs: 8000 });
  });

  it("does not transfer an existing owner's listing even with a valid DNS proof", async () => {
    const claim = await issueSiteClaim(otherId, { siteId, method: "dns_txt" });
    txt.mockResolvedValue([[claim.verification.recordValue]]);
    await expect(verifySiteClaim(otherId, { claimId: claim.id, token: claim.token })).resolves.toMatchObject({ requiresReview: true });
    const [site] = await fixtureSql()`SELECT owner_id FROM sites WHERE id=${siteId}`;
    expect(site.owner_id).toBe(ownerId);
    expect(txt).toHaveBeenCalledWith("_thefastestweb.example.com");
  });

  it("rejects mismatched users/tokens and expired challenges before any network access", async () => {
    const claim = await issueSiteClaim(otherId, { siteId, method: "well_known" });
    await expect(verifySiteClaim(ownerId, { claimId: claim.id, token: claim.token })).rejects.toMatchObject({ status: 409 });
    await expect(verifySiteClaim(otherId, { claimId: claim.id, token: "0".repeat(64) })).rejects.toMatchObject({ status: 409 });
    await fixtureSql()`UPDATE site_claims SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=${claim.id}`;
    await expect(verifySiteClaim(otherId, { claimId: claim.id, token: claim.token })).rejects.toMatchObject({ status: 409 });
    expect(fetchProof).not.toHaveBeenCalled();
  });

  it("limits failed network proofs and invalidates superseded tokens", async () => {
    const claim = await issueSiteClaim(otherId, { siteId, method: "well_known" });
    for (let n=0;n<5;n++) await expect(verifySiteClaim(otherId, { claimId: claim.id, token: claim.token })).rejects.toMatchObject({ status: 422 });
    await expect(verifySiteClaim(otherId, { claimId: claim.id, token: claim.token })).rejects.toMatchObject({ status: 409 });
    expect(fetchProof).toHaveBeenCalledTimes(5);
    const next = await issueSiteClaim(otherId, { siteId, method: "well_known" });
    expect(next.id).not.toBe(claim.id);
    await expect(verifySiteClaim(otherId, { claimId: claim.id, token: claim.token })).rejects.toMatchObject({ status: 409 });
  });

  it("does not disclose private listings through claim creation", async () => {
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${siteId}`;
    await expect(issueSiteClaim(otherId, { siteId, method: "well_known" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("database enforced immutable competition evidence and readiness", () => {
  it("prevents snapshot edits, deletes and late inserts after a period closes", async () => {
    const periodId = randomUUID();
    await getDb()!.execute(sql`INSERT INTO competition_periods(id,kind,period_key,start_at,end_at,ranking_algorithm_version,performance_method_version)
      VALUES(${periodId},'weekly','synthetic-week',now()-interval '14 days',now()-interval '7 days','ranking-v1','psi-v2-two-sample')`);
    await getDb()!.execute(sql`INSERT INTO ranking_snapshots(period_id,scope,site_id,rank,score,sample_count,evidence,site_snapshot)
      VALUES(${periodId},'overall',${siteId},1,98,2,'{}','{}')`);
    await expect(getDb()!.execute(sql`UPDATE ranking_snapshots SET score=100 WHERE period_id=${periodId}`)).rejects.toBeDefined();
    await expect(getDb()!.execute(sql`DELETE FROM ranking_snapshots WHERE period_id=${periodId}`)).rejects.toBeDefined();
    await getDb()!.execute(sql`UPDATE competition_periods SET status='closed',closed_at=now() WHERE id=${periodId}`);
    await expect(getDb()!.execute(sql`INSERT INTO ranking_snapshots(period_id,scope,site_id,rank,score,sample_count,evidence,site_snapshot)
      VALUES(${periodId},'country',${siteId},1,98,2,'{}','{}')`)).rejects.toBeDefined();
    await expect(getDb()!.execute(sql`UPDATE competition_periods SET status='open',closed_at=NULL WHERE id=${periodId}`)).rejects.toBeDefined();
  });

  it("checks new write grants while allowing append-only snapshot permissions", async () => {
    const owner = fixtureSql();
    const role = new URL(process.env.DATABASE_URL!).username;
    await owner`REVOKE UPDATE,DELETE ON public.ranking_snapshots FROM ${owner(role)}`;
    try {
      await expect(checkDatabaseReadiness()).resolves.toBeUndefined();
      await owner`REVOKE INSERT ON public.payment_events FROM ${owner(role)}`;
      try { await expect(checkDatabaseReadiness()).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE", status: 503 }); }
      finally { await owner`GRANT INSERT ON public.payment_events TO ${owner(role)}`; }
      await expect(checkDatabaseReadiness()).resolves.toBeUndefined();
    } finally { await owner`GRANT UPDATE,DELETE ON public.ranking_snapshots TO ${owner(role)}`; }
  });

  it("fails readiness when an immutable-history trigger has been disabled", async () => {
    await fixtureSql()`ALTER TABLE public.ranking_snapshots DISABLE TRIGGER ranking_snapshots_immutable`;
    try { await expect(checkDatabaseReadiness()).rejects.toMatchObject({ status: 503 }); }
    finally { await fixtureSql()`ALTER TABLE public.ranking_snapshots ENABLE TRIGGER ranking_snapshots_immutable`; }
    await expect(checkDatabaseReadiness()).resolves.toBeUndefined();
  });
});
