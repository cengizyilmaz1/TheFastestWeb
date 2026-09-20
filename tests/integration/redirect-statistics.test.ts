import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db";
import { listManagedRedirects, previewRedirect, saveRedirect } from "../../src/modules/redirects/admin";
import { readRedirectStatistics, recordRedirectObservation, type RedirectTarget } from "../../src/modules/redirects/statistics";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

vi.mock("../../src/config/env", () => ({ getEnv: () => ({ SITE_URL: "https://canonical.example.invalid", AUTH_SECRET: "synthetic-redirect-secret-at-least-32-characters" }) }));
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(resetIntegrationData);
async function fixture() {
  const adminId = randomUUID(), publicId = randomUUID(), privateId = randomUUID(), ruleId = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${adminId},${adminId+"@example.invalid"},'Synthetic admin')`;
  await fixtureSql()`INSERT INTO admin_roles(user_id,role) VALUES(${adminId},'admin')`;
  await fixtureSql()`INSERT INTO founders(id,slug,name,visibility) VALUES(${publicId},'public-founder','Public fixture','public'),(${privateId},'private-founder','Private fixture','private')`;
  await fixtureSql()`INSERT INTO founder_slug_aliases(slug,founder_id) VALUES('former-founder',${publicId})`;
  await fixtureSql()`INSERT INTO redirect_rules(id,source_path,destination_path) VALUES(${ruleId},'/former-page','/about')`;
  return { actor: { userId: adminId, role: "admin" as const }, publicId, privateId, ruleId };
}
async function observe(target: RedirectTarget, classification: "human" | "bot" = "human", observedAt = new Date()) {
  await recordRedirectObservation({ target, classification, observedAt });
}
function database() { const db = getDb(); if (!db) throw new Error("Missing test database"); return db; }

describe("durable redirect statistics", () => {
  it("increments atomically under concurrent requests without modifying a pending rule preview", async () => {
    const { actor, ruleId } = await fixture(), target = { kind: "managed" as const, ruleId };
    const input = { id: ruleId, sourcePath: "/former-page", destinationPath: "/pricing", statusCode: 301, enabled: true, expectedVersion: 1, reason: "Synthetic redirect edit" };
    const preview = await previewRedirect(actor, input);
    await Promise.all(Array.from({ length: 32 }, (_, i) => observe(target, i < 25 ? "human" : "bot")));
    const data = await listManagedRedirects(actor);
    expect(data.rules[0].statistics).toMatchObject({ total: 32, human: 25, bot: 7, today: 32, last30Days: 32 });
    expect(data.statistics).toMatchObject({ total: 32, human: 25, bot: 7 });
    expect(data.statistics.daily).toHaveLength(30);
    expect(data.statistics.daily.at(-1)).toMatchObject({ total: 32, human: 25, bot: 7 });
    await expect(saveRedirect(actor, input, preview.token)).resolves.toMatchObject({ saved: true });
    expect((await listManagedRedirects(actor)).rules[0].statistics.total).toBe(32);
  });
  it("uses UTC day boundaries, keeps historical totals and never moves last seen backwards", async () => {
    const { ruleId } = await fixture(), target = { kind: "managed" as const, ruleId };
    for (const date of ["2026-08-21T23:59:59.999Z", "2026-08-22T00:00:00Z", "2026-09-19T23:59:59.999Z", "2026-09-20T00:00:00Z", "2026-09-20T22:00:00Z", "2026-09-20T00:01:00Z"]) {
      await observe(target, "human", new Date(date));
    }
    const data = await database().transaction(tx => readRedirectStatistics(tx, new Date("2026-09-20T23:00:00Z")));
    expect(data.statistics).toMatchObject({ total: 6, human: 6, bot: 0, today: 3, last30Days: 5, lastSeenAt: "2026-09-20T22:00:00.000Z" });
    expect(data.statistics.daily[0]).toEqual({ date: "2026-08-22", total: 1, human: 1, bot: 0 });
    expect(data.statistics.daily.at(-1)).toEqual({ date: "2026-09-20", total: 3, human: 3, bot: 0 });
    expect(data.statistics.daily.reduce((sum, day) => sum + day.total, 0)).toBe(5);
  });
  it("measures only existing public founders and registered aliases, masking legacy account addresses", async () => {
    const { actor, publicId, privateId } = await fixture();
    await observe({ kind: "founder", founderId: publicId, sourcePath: "/profile/[account-id]" });
    await observe({ kind: "founder", founderId: publicId, sourcePath: "/founder/former-founder" }, "bot");
    await observe({ kind: "founder", founderId: publicId, sourcePath: "/founders/public-founder" });
    await observe({ kind: "founder", founderId: privateId, sourcePath: "/profile/[account-id]" });
    await observe({ kind: "founder", founderId: publicId, sourcePath: "/founder/unknown-injected-path" });
    await observe({ kind: "founder", founderId: randomUUID(), sourcePath: "/profile/[account-id]" });
    await observe({ kind: "managed", ruleId: randomUUID() });
    const data = await listManagedRedirects(actor);
    expect(data.statistics).toMatchObject({ total: 3, human: 2, bot: 1 });
    expect(data.founderStatistics).toHaveLength(3);
    expect(data.founderStatistics.map(row => row.sourcePath).sort()).toEqual(["/founder/former-founder", "/founders/public-founder", "/profile/[account-id]"]);
    expect(data.founderStatistics.every(row => row.founderId === publicId && row.username === "public-founder")).toBe(true);
    await fixtureSql()`UPDATE founders SET visibility='private' WHERE id=${publicId}`;
    await observe({ kind: "founder", founderId: publicId, sourcePath: "/profile/[account-id]" });
    const hidden = await listManagedRedirects(actor);
    expect(hidden.founderStatistics).toEqual([]);
    expect(hidden.statistics.total).toBe(0);
    expect((await fixtureSql()`SELECT sum(human_requests+bot_requests)::int AS total FROM founder_redirect_daily_stats`)[0].total).toBe(3);
  });
  it("rechecks administrator access before revealing counts", async () => {
    const { actor, ruleId } = await fixture();
    await observe({ kind: "managed", ruleId });
    await fixtureSql()`UPDATE admin_roles SET role='moderator' WHERE user_id=${actor.userId}`;
    await expect(listManagedRedirects(actor)).rejects.toMatchObject({ status: 403 });
    await fixtureSql()`DELETE FROM admin_roles WHERE user_id=${actor.userId}`;
    await expect(listManagedRedirects(actor)).rejects.toMatchObject({ status: 403 });
  });
  it("enforces nonnegative counts and removes aggregate history with the referenced identity", async () => {
    const { ruleId, publicId } = await fixture();
    await observe({ kind: "managed", ruleId });
    await observe({ kind: "founder", founderId: publicId, sourcePath: "/profile/[account-id]" });
    await expect(fixtureSql()`UPDATE redirect_rule_daily_stats SET human_requests=-1`).rejects.toMatchObject({ code: "23514" });
    await expect(fixtureSql()`UPDATE founder_redirect_daily_stats SET source_path='/profile/private-account'`).rejects.toMatchObject({ code: "23514" });
    await fixtureSql()`DELETE FROM redirect_rules WHERE id=${ruleId}`;
    await fixtureSql()`DELETE FROM founders WHERE id=${publicId}`;
    expect(await fixtureSql()`SELECT * FROM redirect_rule_daily_stats`).toHaveLength(0);
    expect(await fixtureSql()`SELECT * FROM founder_redirect_daily_stats`).toHaveLength(0);
  });
});
