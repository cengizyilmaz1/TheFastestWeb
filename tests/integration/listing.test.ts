import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifiedPerformanceResult } from "@/db/schema";
import { getDb } from "@/db";
import { sql as drizzleSql } from "drizzle-orm";
import { createListing } from "@/modules/sites/create-listing";
import { synchronizeGoogleUser } from "@/modules/auth/google-user";
import { submissionSchema, type SubmissionInput } from "@/modules/sites/input";
import { normalizePublicUrl } from "@/lib/security/public-url";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const { badge } = vi.hoisted(() => ({ badge: vi.fn() }));
vi.mock("@/infrastructure/browser/badge-verification", () => ({ getVerifiedBadge: badge }));

const serverResult: VerifiedPerformanceResult = {
  lighthouseVersion: "13.0.0",
  score: 67, loadTimeMs: 2460, fcpMs: 1110, lcpMs: 2460, cls: 0.12,
  tbtMs: 210, ttiMs: 2710, siMs: 2240,
  fcpScore: 0.87, lcpScore: 0.63, clsScore: 0.8, tbtScore: 0.7, ttiScore: 0.7, siScore: 0.8,
  fcp: "1.1 s", lcp: "2.5 s", clsDisplay: "0.12", tbt: "210 ms", tti: "2.7 s", si: "2.2 s", loadTime: "2.5 s",
};

async function user(isPro = true, email = `${randomUUID()}@example.invalid`) {
  const id = randomUUID();
  await fixtureSql()`INSERT INTO public.users (id,email,name,is_pro) VALUES (${id},${email},'Synthetic owner',${isPro})`;
  return id;
}

async function proof(userId: string, url: string, overrides: {
  strategy?: "mobile" | "desktop"; expired?: boolean; consumed?: boolean;
  result?: VerifiedPerformanceResult;
} = {}) {
  const id = randomUUID();
  const created = new Date(Date.now() - 120_000);
  const expiry = new Date(Date.now() + (overrides.expired ? -60_000 : 600_000));
  const result = overrides.result ?? serverResult;
  await fixtureSql()`INSERT INTO public.verified_speed_tests
    (id,user_id,normalized_url,strategy,job_id,result,methodology_version,created_at,expires_at,consumed_at)
    VALUES (${id},${userId},${normalizePublicUrl(url)},${overrides.strategy ?? "mobile"},${randomUUID()},
      ${fixtureSql().json(result)},'psi-v1-single',${created},${expiry},${overrides.consumed ? new Date() : null})`;
  return id;
}

function input(url: string, testResultId: string, name = `Site ${randomUUID().slice(0, 8)}`): SubmissionInput {
  return submissionSchema.parse({ url, testResultId, name, description: "An entirely synthetic integration fixture.", category: "tool", isListed: true });
}

async function rowCounts() {
  const [row] = await fixtureSql()`SELECT (SELECT count(*) FROM public.sites)::integer AS sites,
    (SELECT count(*) FROM public.speed_tests)::integer AS tests`;
  return { ...row };
}

beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => {
  await resetIntegrationData();
  badge.mockReset().mockResolvedValue({ verified: true, status: "verified" });
});

describe("listing transactions with the least-privilege application role", () => {
  it("uses an unprivileged application connection", async () => {
    const rows = await getDb()!.execute(drizzleSql`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=current_user`);
    expect({ ...rows[0] }).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
    await expect(getDb()!.execute(drizzleSql`CREATE TABLE public.forbidden (id integer)`)).rejects.toThrow();
    await expect(getDb()!.execute(drizzleSql`SELECT * FROM app_meta.schema_migrations`)).rejects.toThrow();
  });

  it("persists only the server result and atomically consumes its proof", async () => {
    const owner = await user();
    const url = "https://example.com/product?utm_source=fixture#ignored";
    const token = await proof(owner, url);
    const request = input(url, token, "Verified product");
    const site = await createListing(owner, request);
    expect(site.currentScore).toBe(serverResult.score);
    expect(site.normalizedUrl).toBe("https://example.com/product");
    expect(site.tier).toBe("pro");
    const [history] = await fixtureSql()`SELECT score,load_time_ms,fcp_ms,lcp_ms,tbt_ms,tti_ms,si_ms,strategy,methodology_version,raw_response
      FROM public.speed_tests WHERE site_id=${site.id}`;
    expect({ ...history }).toEqual({ score: 67, load_time_ms: 2460, fcp_ms: 1110, lcp_ms: 2460,
      tbt_ms: 210, tti_ms: 2710, si_ms: 2240, strategy: "mobile", methodology_version: "psi-v1-single", raw_response: null });
    const [used] = await fixtureSql()`SELECT consumed_at,site_id FROM public.verified_speed_tests WHERE id=${token}`;
    expect(used.consumed_at).toBeInstanceOf(Date);
    expect(used.site_id).toBe(site.id);
    expect(await rowCounts()).toEqual({ sites: 1, tests: 1 });
    expect(badge).not.toHaveBeenCalled();
  });

  it.each(["score", "speedData", "isPro", "tier", "ownerId"])("rejects client-supplied %s before submission", (field) => {
    const request = input("https://example.com/", randomUUID());
    expect(submissionSchema.safeParse({ ...request, [field]: field === "speedData" ? { score: 100 } : 100 }).success).toBe(false);
  });

  it.each(["missing", "wrong-user", "wrong-url", "expired", "desktop", "consumed"] as const)("rejects %s proof without creating a site or history", async (scenario) => {
    const owner = await user();
    const url = "https://example.com/";
    const token = scenario === "missing" ? randomUUID() : await proof(
      scenario === "wrong-user" ? await user() : owner,
      scenario === "wrong-url" ? "https://example.org/" : url,
      { expired: scenario === "expired", strategy: scenario === "desktop" ? "desktop" : "mobile", consumed: scenario === "consumed" },
    );
    await expect(createListing(owner, input(url, token))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rowCounts()).toEqual({ sites: 0, tests: 0 });
    if (!["missing", "consumed"].includes(scenario)) {
      const [row] = await fixtureSql()`SELECT consumed_at FROM public.verified_speed_tests WHERE id=${token}`;
      expect(row.consumed_at).toBeNull();
    }
  });

  it("allows exactly one concurrent proof redemption and refuses replay", async () => {
    const owner = await user();
    const url = "https://example.com/";
    const token = await proof(owner, url);
    const request = input(url, token);
    const results = await Promise.allSettled([createListing(owner, request), createListing(owner, request)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(createListing(owner, request)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rowCounts()).toEqual({ sites: 1, tests: 1 });
  });

  it("serializes canonical duplicate submissions from different owners", async () => {
    const first = await user();
    const second = await user();
    const one = "https://EXAMPLE.com?utm_source=one#fragment";
    const two = "https://example.com/";
    const firstProof = await proof(first, one);
    const secondProof = await proof(second, two);
    const results = await Promise.allSettled([
      createListing(first, input(one, firstProof, "First contender")),
      createListing(second, input(two, secondProof, "Second contender")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [evidence] = await fixtureSql()`SELECT count(*) FILTER (WHERE consumed_at IS NOT NULL)::integer AS consumed,
      count(*) FILTER (WHERE consumed_at IS NULL)::integer AS available FROM public.verified_speed_tests`;
    expect({ ...evidence }).toEqual({ consumed: 1, available: 1 });
    expect(await rowCounts()).toEqual({ sites: 1, tests: 1 });
  });

  it("serializes the one-site free allowance without consuming the losing proof", async () => {
    const owner = await user(false);
    const firstUrl = "https://example.com/";
    const secondUrl = "https://example.org/";
    const firstProof = await proof(owner, firstUrl);
    const secondProof = await proof(owner, secondUrl);
    const results = await Promise.allSettled([
      createListing(owner, input(firstUrl, firstProof, "Free first")),
      createListing(owner, input(secondUrl, secondProof, "Free second")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "FORBIDDEN" });
    const [remaining] = await fixtureSql()`SELECT count(*)::integer AS available FROM public.verified_speed_tests WHERE consumed_at IS NULL`;
    expect(remaining.available).toBe(1);
    expect(await rowCounts()).toEqual({ sites: 1, tests: 1 });
    expect(badge).toHaveBeenCalledTimes(2);
  });

  it("leaves a proof available when its requested slug already exists", async () => {
    const owner = await user();
    const first = await proof(owner, "https://example.com/");
    await createListing(owner, input("https://example.com/", first, "Same name"));
    const second = await proof(owner, "https://example.org/");
    await expect(createListing(owner, input("https://example.org/", second, "Same name"))).rejects.toMatchObject({ code: "CONFLICT" });
    const [row] = await fixtureSql()`SELECT consumed_at FROM public.verified_speed_tests WHERE id=${second}`;
    expect(row.consumed_at).toBeNull();
    expect(await rowCounts()).toEqual({ sites: 1, tests: 1 });
  });

  it("returns a conflict for concurrent equal slugs on different URLs and owners", async () => {
    const firstOwner = await user(), secondOwner = await user();
    const firstToken = await proof(firstOwner, "https://example.com/");
    const secondToken = await proof(secondOwner, "https://example.org/");
    const results = await Promise.allSettled([
      createListing(firstOwner, input("https://example.com/", firstToken, "Concurrent name")),
      createListing(secondOwner, input("https://example.org/", secondToken, "Concurrent name")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "CONFLICT", status: 409 });
    const [proofs] = await fixtureSql()`SELECT count(*) FILTER (WHERE consumed_at IS NULL)::integer AS available FROM public.verified_speed_tests`;
    expect(proofs.available).toBe(1);
    expect(await rowCounts()).toEqual({ sites: 1, tests: 1 });
  });

  it("prevents free accounts bypassing badges through a private listing", async () => {
    const owner = await user(false);
    const url = "https://example.com/";
    const token = await proof(owner, url);
    await expect(createListing(owner, { ...input(url, token), isListed: false }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(badge).not.toHaveBeenCalled();
    expect(await rowCounts()).toEqual({ sites: 0, tests: 0 });
    const [stored] = await fixtureSql()`SELECT consumed_at FROM public.verified_speed_tests WHERE id=${token}`;
    expect(stored.consumed_at).toBeNull();
  });

  it("takes membership and owner identity from the database", async () => {
    const owner = await user(false);
    const url = "https://example.com/";
    const token = await proof(owner, url);
    const request = { ...input(url, token), isPro: true, tier: "pro", ownerName: "Spoofed" } as SubmissionInput;
    const site = await createListing(owner, request);
    expect(site.tier).toBe("free");
    expect(site.requiresBadge).toBe(true);
    expect(site.ownerName).toBe("Synthetic owner");
    expect(badge).toHaveBeenCalledOnce();
  });

  it("rolls back proof consumption if a database insert fails", async () => {
    const owner = await user();
    const url = "https://example.com/";
    const token = await proof(owner, url, { result: { ...serverResult, score: null } as unknown as VerifiedPerformanceResult });
    await expect(createListing(owner, input(url, token))).rejects.toThrow();
    const [row] = await fixtureSql()`SELECT consumed_at,site_id FROM public.verified_speed_tests WHERE id=${token}`;
    expect({ ...row }).toEqual({ consumed_at: null, site_id: null });
    expect(await rowCounts()).toEqual({ sites: 0, tests: 0 });
  });
});

describe("Google identity continuity", () => {
  it("preserves a restored UUID, pro status and site ownership on returning email", async () => {
    const owner = await user(true, "Returning.Owner@example.invalid");
    const url = "https://example.com/";
    const token = await proof(owner, url);
    const site = await createListing(owner, input(url, token));
    const returned = await synchronizeGoogleUser({ email: " returning.owner@EXAMPLE.invalid ", name: "New display name", image: "https://example.com/avatar.png" });
    expect(returned).toBe(owner);
    const [identity] = await fixtureSql()`SELECT u.id,u.is_pro,u.name,s.owner_id FROM public.users u JOIN public.sites s ON s.owner_id=u.id WHERE s.id=${site.id}`;
    expect({ ...identity }).toEqual({ id: owner, is_pro: true, name: "New display name", owner_id: owner });
    const [count] = await fixtureSql()`SELECT count(*)::integer AS users FROM public.users`;
    expect(count.users).toBe(1);
  });

  it("creates one UUID for concurrent first logins of the same email", async () => {
    const results = await Promise.all([
      synchronizeGoogleUser({ email: "new.owner@example.invalid", name: "First name" }),
      synchronizeGoogleUser({ email: "NEW.OWNER@example.invalid", name: "Second name" }),
    ]);
    expect(results[0]).toBe(results[1]);
    const [count] = await fixtureSql()`SELECT count(*)::integer AS users FROM public.users`;
    expect(count.users).toBe(1);
  });
});
