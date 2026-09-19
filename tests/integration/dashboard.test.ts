import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDashboard } from "../../src/modules/dashboard/queries";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(resetIntegrationData);
describe("private account dashboard", () => {
  it("isolates sites, notifications, access and totals by account", async () => {
    const owner = randomUUID(), other = randomUUID(), firstSite = randomUUID(), secondSite = randomUUID();
    for (const id of [owner, other]) await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${id},${`${id}@example.com`},'Synthetic')`;
    for (const [id, userId] of [[firstSite, owner], [secondSite, other]]) {
      await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_name,owner_id)
        VALUES(${id},${id},'Synthetic',${`https://example.com/${id}`},${`https://example.com/${id}`},'Synthetic','Synthetic',${userId})`;
      await fixtureSql()`INSERT INTO notifications(user_id,event_key,type,payload) VALUES(${userId},${`welcome:${id}`},'welcome','{}')`;
      await fixtureSql()`INSERT INTO entitlements(user_id,site_id,kind,source,source_id) VALUES(${userId},${id},'PRO','legacy',${id})`;
    }
    const dashboard = await getDashboard(owner);
    expect(dashboard.ownedSites.map((site) => site.id)).toEqual([firstSite]);
    expect(dashboard.messages).toHaveLength(1); expect(dashboard.grants).toHaveLength(1);
    expect(dashboard.totals).toMatchObject({ websites: 1, grants: 1, unread: 1, claims: 0 });
    expect(JSON.stringify(dashboard)).not.toContain(secondSite);
  });
  it("rejects malformed site pagination before a query", async () => {
    await expect(getDashboard(randomUUID(), "invalid")).rejects.toMatchObject({ status: 400 });
  });
  it("projects only validated notification details and rejects unsafe destinations", async () => {
    const user = randomUUID();
    await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${user},'details@example.invalid','Synthetic')`;
    await fixtureSql()`INSERT INTO notifications(user_id,event_key,type,payload) VALUES
      (${user},'details:safe','performance_improved','{"siteName":"Synthetic","score":88,"previousScore":70,"actionPath":"/site/synthetic"}'),
      (${user},'details:unsafe','welcome','{"actionPath":"//evil.example","secret":"must-not-leak"}')`;
    const dashboard = await getDashboard(user);
    expect(dashboard.messages.find((message) => message.type === 'performance_improved')?.details).toMatchObject({ siteName: 'Synthetic', score: 88, previousScore: 70, actionPath: '/site/synthetic' });
    expect(dashboard.messages.find((message) => message.type === 'welcome')?.details).toEqual({});
    expect(JSON.stringify(dashboard.messages)).not.toContain('evil.example');
    expect(JSON.stringify(dashboard.messages)).not.toContain('must-not-leak');
  });
});
