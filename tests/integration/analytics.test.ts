import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db";
import { getAnalyticsSummary, recordAnalyticsEvent } from "../../src/modules/analytics/events";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(resetIntegrationData);
describe("trusted internal domain analytics", () => {
  it("deduplicates concurrent worker retries using the business key", async () => {
    const input = { name: "badge_verified" as const, eventKey: `badge:${randomUUID()}:verified`, properties: {} };
    const results = await Promise.all(Array.from({ length: 8 }, () => recordAnalyticsEvent(input)));
    expect(results.filter((result) => result.recorded)).toHaveLength(1);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM analytics_events`)[0].count).toBe(1);
  });
  it("rolls back an event with its failed business transaction", async () => {
    await expect(getDb()!.transaction(async (tx) => {
      await recordAnalyticsEvent({ name: "checkout_started", eventKey: `checkout:${randomUUID()}:started`, properties: { kind: "pro_listing" } }, tx);
      throw new Error("Synthetic business rollback");
    })).rejects.toThrow("Synthetic business rollback");
    expect(await fixtureSql()`SELECT id FROM analytics_events`).toHaveLength(0);
  });
  it("reports server business events separately from unverified ad interactions", async () => {
    await recordAnalyticsEvent({ name: "badge_verified", eventKey: "badge:synthetic:verified", properties: {} });
    await recordAnalyticsEvent({ name: "ad_clicked", eventKey: "click:synthetic", properties: { placement: "left" } });
    const rows = await getAnalyticsSummary();
    expect(rows.find((row) => row.name === "badge_verified")).toMatchObject({ count: 1, trust: "server_business_event" });
    expect(rows.find((row) => row.name === "ad_clicked")).toMatchObject({ count: 1, trust: "unverified_interaction" });
    expect(Object.keys(rows[0]).sort()).toEqual(["count", "day", "name", "trust"]);
  });
  it("bounds reports to the last thirty days", async () => {
    await recordAnalyticsEvent({ name: "badge_verified", eventKey: "badge:old", properties: {} });
    await fixtureSql()`UPDATE analytics_events SET occurred_at=now()-interval '31 days'`;
    expect(await getAnalyticsSummary()).toEqual([]);
  });
});
