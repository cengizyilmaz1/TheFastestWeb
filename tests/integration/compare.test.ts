import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getComparison } from "../../src/modules/compare/service";
import { PERFORMANCE_METHOD_VERSION } from "../../src/modules/performance/service";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
const current = vi.hoisted(() => ({ userId: "" }));
vi.mock("../../src/auth", () => ({ auth: async () => ({ user: { id: current.userId } }) }));
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(resetIntegrationData);
async function setup() {
  current.userId = randomUUID();
  const left = randomUUID(), right = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${current.userId},'compare@example.invalid','Synthetic comparison owner')`;
  for (const [id, slug] of [[left, "compare-alpha"], [right, "compare-beta"]]) {
    await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_name,owner_id,is_listed,lifecycle)
      VALUES(${id},${slug},${slug},${`https://example.com/${slug}`},${`https://example.com/${slug}`},'Synthetic comparison','Synthetic',${current.userId},true,'active')`;
  }
  return { left, right, pair: "compare-alpha~vs~compare-beta" };
}
async function measurement(siteId: string, method: string, score: number, strategy = "mobile") {
  await fixtureSql()`INSERT INTO speed_tests(site_id,score,strategy,methodology_version,sample_count,metrics_source,lcp_ms)
    VALUES(${siteId},${score},${strategy},${method},2,'lab',1000)`;
}
describe("public comparison queries", () => {
  it("does not expose an owner's private, archived or suspended website", async () => {
    const { left, pair } = await setup();
    for (const field of ["private", "archived", "suspended"]) {
      await fixtureSql()`UPDATE sites SET is_listed=${field !== "private"},archived_at=${field === "archived" ? new Date() : null},lifecycle=${field === "suspended" ? "suspended" : "active"} WHERE id=${left}`;
      expect(await getComparison(pair)).toBeNull();
    }
  });
  it("uses shared methodology even when an incompatible measurement is newer", async () => {
    const { left, right, pair } = await setup();
    await measurement(left, PERFORMANCE_METHOD_VERSION, 92); await measurement(right, PERFORMANCE_METHOD_VERSION, 86);
    await measurement(left, "legacy-unspecified", 100);
    const result = await getComparison(pair);
    expect(result).toMatchObject({ method: PERFORMANCE_METHOD_VERSION, comparable: true, delta: 6, indexable: false });
    expect(result?.left.latest?.score).toBe(92);
    expect(result?.left.history.map((point) => point.score)).toEqual([92]);
    expect(await getComparison(pair, "desktop")).toMatchObject({ comparable: false, delta: null, indexable: false });
  });
  it("does not manufacture comparable scores for disjoint or unavailable requested methods", async () => {
    const { left, right, pair } = await setup();
    await measurement(left, "legacy-unspecified", 92); await measurement(right, PERFORMANCE_METHOD_VERSION, 86);
    expect(await getComparison(pair)).toMatchObject({ method: null, comparable: false, delta: null, indexable: false });
    expect(await getComparison(pair, "mobile", "missing-method")).toMatchObject({ method: null, comparable: false, delta: null });
  });
});
