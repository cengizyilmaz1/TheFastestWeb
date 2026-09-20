import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { backfillFounderUsernames } from "../../scripts/db/backfill-founder-usernames";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
let temporaryDirectory: string;
let actorUserId: string;
beforeAll(prepareIntegrationDatabase, 60_000); afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => {
  await resetIntegrationData(); temporaryDirectory = await mkdtemp(join(tmpdir(), "tfw-founder-plan-")); actorUserId = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${actorUserId},'backfill-admin@example.invalid','Operator')`;
  await fixtureSql()`INSERT INTO admin_roles(user_id,role) VALUES(${actorUserId},'admin')`;
});
afterEach(async () => { await rm(temporaryDirectory, { recursive: true, force: true }); });
function options() {
  const databaseUrl = process.env.DATABASE_URL!;
  return { databaseUrl, expectedDatabase: new URL(databaseUrl).pathname.slice(1), actorUserId, planPath: join(temporaryDirectory, "plan.json") };
}
async function founder(name: string, visibility = "public", username?: string) {
  const id = randomUUID(), slug = username ?? `legacy-${id}`;
  await fixtureSql()`INSERT INTO founders(id,slug,name,visibility) VALUES(${id},${slug},${name},${visibility})`;
  return { id, slug };
}
describe("reviewed public founder URL backfill", () => {
  it("previews without writes, keeps private and custom identities, preserves aliases and audits the atomic apply", async () => {
    const a = await founder("Cengiz YILMAZ"), b = await founder("Cengiz YILMAZ"), privateFounder = await founder("Hidden Person", "private");
    const custom = await founder("Custom", "public", "cengiz-yilmaz"), email = await founder("published@example.invalid");
    const config = options(), preview = await backfillFounderUsernames(config);
    expect(preview).toMatchObject({ applied: false, profiles: 3 });
    expect((await fixtureSql()`SELECT slug FROM founders WHERE id=${a.id}`)[0].slug).toBe(a.slug);
    const plan = JSON.parse(await readFile(config.planPath, "utf8"));
    expect(plan.changes.map((row: { to: string }) => row.to).sort()).toEqual(["cengiz-yilmaz-2", "cengiz-yilmaz-3", "member"]);
    expect(await backfillFounderUsernames({ ...config, confirmDigest: preview.digest })).toMatchObject({ applied: true, profiles: 3 });
    for (const initial of [a, b, email]) {
      const [profile] = await fixtureSql()`SELECT slug,visibility FROM founders WHERE id=${initial.id}`;
      expect(profile.visibility).toBe("public");
      expect((await fixtureSql()`SELECT slug FROM founder_slug_aliases WHERE founder_id=${initial.id} ORDER BY slug`).map(row => row.slug).sort())
        .toEqual([initial.slug, profile.slug].sort());
    }
    for (const unchanged of [privateFounder, custom]) expect((await fixtureSql()`SELECT slug FROM founders WHERE id=${unchanged.id}`)[0].slug).toBe(unchanged.slug);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM audit_logs WHERE action='founder.username.backfill' AND actor_user_id=${actorUserId}`)[0].count).toBe(3);
    await expect(backfillFounderUsernames({ ...config, confirmDigest: preview.digest })).rejects.toThrow("namespace changed");
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM audit_logs`)[0].count).toBe(3);
  });
  it("rejects namespace drift, confirmation changes and wrong targets without partial writes", async () => {
    const original = await founder("Published Person"), config = options(), preview = await backfillFounderUsernames(config);
    await founder("New identity", "private", "new-identity");
    await expect(backfillFounderUsernames({ ...config, confirmDigest: preview.digest })).rejects.toThrow("namespace changed");
    await expect(backfillFounderUsernames({ ...config, confirmDigest: "0".repeat(64) })).rejects.toThrow("confirmation digest changed");
    await expect(backfillFounderUsernames({ ...config, expectedDatabase: "different_database" })).rejects.toThrow("does not match");
    expect((await fixtureSql()`SELECT slug FROM founders WHERE id=${original.id}`)[0].slug).toBe(original.slug);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM audit_logs`)[0].count).toBe(0);
  });
  it("rechecks the administrator grant before applying an approved plan", async () => {
    const original = await founder("Published Person"), config = options(), preview = await backfillFounderUsernames(config);
    await fixtureSql()`DELETE FROM admin_roles WHERE user_id=${actorUserId}`;
    await expect(backfillFounderUsernames({ ...config, confirmDigest: preview.digest })).rejects.toThrow("not a current administrator");
    expect((await fixtureSql()`SELECT slug FROM founders WHERE id=${original.id}`)[0].slug).toBe(original.slug);
  });
});
