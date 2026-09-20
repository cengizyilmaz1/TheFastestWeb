import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
const rateLimit = vi.hoisted(() => vi.fn());
vi.mock("../../src/config/env", () => ({ getEnv: () => ({ SITE_URL: "https://example.com", NODE_ENV: "test", AUTH_SECRET: "synthetic-click-secret-at-least-32-characters" }) }));
vi.mock("../../src/modules/security/rate-limit", () => ({ enforceRateLimit: rateLimit }));
import { POST } from "../../src/app/api/site-click/route";
import { getAnalyticsSummary } from "../../src/modules/analytics/events";
beforeAll(prepareIntegrationDatabase, 60_000); afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => { await resetIntegrationData(); rateLimit.mockReset().mockResolvedValue(undefined); });
const request = (id: string, headers: Record<string, string> = {}) => new NextRequest("https://example.com/api/site-click", { method: "POST",
  headers: { origin: "https://example.com", "content-type": "application/json", "x-forwarded-for": "198.51.100.4", ...headers }, body: JSON.stringify({ id }) });
async function site() {
  const id = randomUUID();
  await fixtureSql()`INSERT INTO sites(id,name,slug,url,normalized_url,owner_name,description,is_listed,lifecycle) VALUES(${id},'Synthetic','synthetic','https://example.org/','https://example.org/','Synthetic','Synthetic',true,'active')`;
  return id;
}
describe("bounded product-link observations", () => {
  it("deduplicates concurrent requests and reports them as unverified interactions", async () => {
    const id = await site();
    const responses = await Promise.all(Array.from({ length: 6 }, () => POST(request(id), undefined)));
    expect(responses.every(response => response.status === 200)).toBe(true);
    const bodies = await Promise.all(responses.map(response => response.json()));
    expect(bodies.filter(body => !body.deduped)).toHaveLength(1);
    const rows = await fixtureSql()`SELECT name,site_id,properties,event_key FROM analytics_events`;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ name: "site_clicked", site_id: id, properties: { placement: "product" } });
    expect(JSON.stringify(rows)).not.toContain("198.51.100.4");
    expect((await getAnalyticsSummary())[0]).toMatchObject({ name: "site_clicked", trust: "unverified_interaction", count: 1 });
  });
  it.each(["hidden", "archived", "suspended"])("does not observe a %s website", async state => {
    const id = await site();
    if (state === "hidden") await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${id}`;
    if (state === "archived") await fixtureSql()`UPDATE sites SET archived_at=now() WHERE id=${id}`;
    if (state === "suspended") await fixtureSql()`UPDATE sites SET lifecycle='suspended' WHERE id=${id}`;
    expect((await POST(request(id), undefined)).status).toBe(404);
    expect(await fixtureSql()`SELECT id FROM analytics_events`).toHaveLength(0);
  });
  it.each<Record<string, string>>([{ "user-agent": "Googlebot/2.1" }, { "sec-purpose": "prefetch" }])("ignores automated requests", async headers => {
    const id = await site(); expect((await POST(request(id, headers), undefined)).status).toBe(200);
    expect(rateLimit).not.toHaveBeenCalled(); expect(await fixtureSql()`SELECT id FROM analytics_events`).toHaveLength(0);
  });
  it("rejects a foreign origin before quota or database work", async () => {
    expect((await POST(request(randomUUID(), { origin: "https://unrelated.example" }), undefined)).status).toBe(403);
    expect(rateLimit).not.toHaveBeenCalled();
  });
});
