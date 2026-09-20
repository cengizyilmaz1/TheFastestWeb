import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
const rateLimit = vi.hoisted(() => vi.fn());
vi.mock("../../src/config/env", () => ({ getEnv: () => ({ SITE_URL: "https://example.com", NODE_ENV: "test", AUTH_SECRET: "synthetic-ad-click-secret-at-least-32-characters" }) }));
vi.mock("../../src/modules/security/rate-limit", () => ({ enforceRateLimit: rateLimit }));
import { POST } from "../../src/app/api/ad-click/route";
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => { await resetIntegrationData(); rateLimit.mockReset().mockResolvedValue(undefined); });
const request = (id: number, origin = "https://example.com") => new NextRequest("https://example.com/api/ad-click", { method: "POST",
  headers: { origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.1" }, body: JSON.stringify({ id }) });
async function slot() {
  const [row] = await fixtureSql()`INSERT INTO ad_slots(position,order_index,name,tagline,url,is_active,status)
    VALUES('left',1,'Synthetic','Synthetic','https://example.org',true,'active') RETURNING id`;
  return row.id as number;
}
describe("bounded advertisement click observations", () => {
  it("deduplicates concurrent clicks and records one unverified analytics event", async () => {
    const id = await slot();
    const responses = await Promise.all(Array.from({ length: 6 }, () => POST(request(id), undefined)));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies.filter((body) => !body.deduped)).toHaveLength(1);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM ad_clicks`)[0].count).toBe(1);
    const events = await fixtureSql()`SELECT name,properties FROM analytics_events`;
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ name: "ad_clicked", properties: { placement: "left" } });
    expect(rateLimit).toHaveBeenCalledTimes(12);
  });
  it.each(["inactive", "pending", "expired"])("rejects %s advertisements without creating click facts", async (state) => {
    const id = await slot();
    if (state === "inactive") await fixtureSql()`UPDATE ad_slots SET is_active=false WHERE id=${id}`;
    if (state === "pending") await fixtureSql()`UPDATE ad_slots SET status='pending' WHERE id=${id}`;
    if (state === "expired") await fixtureSql()`UPDATE ad_slots SET expires_at=now()-interval '1 second' WHERE id=${id}`;
    expect((await POST(request(id), undefined)).status).toBe(404);
    expect(await fixtureSql()`SELECT id FROM ad_clicks`).toHaveLength(0);
    expect(await fixtureSql()`SELECT id FROM analytics_events`).toHaveLength(0);
  });
  it("rejects a foreign origin before recording or consuming quota", async () => {
    const id = await slot();
    expect((await POST(request(id, "https://unrelated.example"), undefined)).status).toBe(403);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(await fixtureSql()`SELECT id FROM analytics_events`).toHaveLength(0);
  });
  it("ignores declared crawlers without storing observations", async () => {
    const id = await slot(), req = request(id);
    req.headers.set("user-agent", "GPTBot/1.3");
    expect((await POST(req, undefined)).status).toBe(200);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(await fixtureSql()`SELECT id FROM ad_clicks`).toHaveLength(0);
  });
});
