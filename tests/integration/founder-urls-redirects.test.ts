import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db";
import { changeOwnUsername, ensureFounderIdentity, resolveFounderUsername } from "../../src/modules/founders/usernames";
import { saveFounderProfile } from "../../src/modules/founders/service";
import { listManagedRedirects, previewRedirect, saveRedirect } from "../../src/modules/redirects/admin";
import { resolveManagedRedirect } from "../../src/modules/redirects/resolve";
import { GET as legacyProfile } from "../../src/app/profile/[userId]/route";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("../../src/auth", () => ({ auth }));
vi.mock("../../src/config/env", () => ({ getEnv: () => ({ SITE_URL: "https://canonical.example.invalid", AUTH_SECRET: "synthetic-redirect-secret-at-least-32-characters" }) }));
beforeAll(prepareIntegrationDatabase, 60_000); afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => { await resetIntegrationData(); auth.mockResolvedValue(null); });
async function user(role?: "admin" | "moderator") {
  const userId = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${userId},${userId+"@example.invalid"},'Private account name')`;
  if (role) await fixtureSql()`INSERT INTO admin_roles(user_id,role) VALUES(${userId},${role})`;
  return { userId, role: role ?? "admin" as const };
}
async function identity(userId: string, name: string) {
  const db = getDb(); if (!db) throw new Error("Missing fixture");
  return db.transaction(tx => ensureFounderIdentity(tx, userId, name));
}
const requestLegacy = (userId: string) => legacyProfile(new Request("https://canonical.example.invalid/profile/"+userId), { params: Promise.resolve({ userId }) });
describe("persistent founder usernames", () => {
  it("allocates collision-safe readable names under concurrent signups and never publishes them", async () => {
    const a = await user(), b = await user();
    const profiles = await Promise.all([identity(a.userId, "Cengiz YILMAZ"), identity(b.userId, "Cengiz YILMAZ")]);
    expect(profiles.map(p => p.slug).sort()).toEqual(["cengiz-yilmaz", "cengiz-yilmaz-2"]);
    expect(profiles.every(p => p.visibility === "private")).toBe(true);
    expect((await identity(a.userId, "Changed OAuth name")).slug).toBe(profiles[0].slug);
    expect(await resolveFounderUsername(profiles[0].slug)).toBeNull();
    expect(await resolveFounderUsername(profiles[0].slug, b.userId)).toBeNull();
    expect((await resolveFounderUsername(profiles[0].slug, a.userId))?.userId).toBe(a.userId);
    expect((await identity((await user()).userId, "private@example.invalid")).slug).toBe("member");
  });
  it("reserves former names, resolves directly after repeated renames and honors opt-out", async () => {
    const a = await user(), b = await user(), profile = await identity(a.userId, "First Name");
    await fixtureSql()`UPDATE founders SET visibility='public' WHERE id=${profile.id}`;
    const first = { username: "second-name", expectedUsername: profile.slug, requestId: randomUUID() };
    await changeOwnUsername(a.userId, first);
    expect(await changeOwnUsername(a.userId, first)).toMatchObject({ username: "second-name" });
    await changeOwnUsername(a.userId, { username: "third-name", expectedUsername: "second-name", requestId: randomUUID() });
    expect((await resolveFounderUsername("first-name"))?.slug).toBe("third-name");
    expect((await resolveFounderUsername("second-name"))?.slug).toBe("third-name");
    await expect(saveFounderProfile(b.userId, { slug: "first-name", name: "Different person" })).rejects.toMatchObject({ status: 409 });
    await expect(changeOwnUsername(a.userId, { username: "stale-name", expectedUsername: "second-name", requestId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    await fixtureSql()`UPDATE founders SET visibility='private' WHERE id=${profile.id}`;
    expect(await resolveFounderUsername("first-name")).toBeNull();
    expect((await resolveFounderUsername("first-name", a.userId))?.slug).toBe("third-name");
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM audit_logs WHERE action='founder.username'`)[0].count).toBe(2);
  });
  it("returns a real 301 for a public UUID and protects private or unknown accounts", async () => {
    const a = await user(), b = await user(), profile = await identity(a.userId, "Public Founder");
    expect((await requestLegacy(a.userId)).status).toBe(404);
    auth.mockResolvedValue({ user: { id: b.userId } }); expect((await requestLegacy(a.userId)).status).toBe(404);
    auth.mockResolvedValue({ user: { id: a.userId } });
    const own = await requestLegacy(a.userId);
    expect(own.status).toBe(301); expect(own.headers.get("location")).toBe("https://canonical.example.invalid/founder/public-founder");
    expect(own.headers.get("cache-control")).toContain("no-store");
    await fixtureSql()`UPDATE founders SET visibility='public' WHERE id=${profile.id}`;
    auth.mockResolvedValue(null); expect((await requestLegacy(a.userId)).status).toBe(301);
    expect((await requestLegacy(randomUUID())).status).toBe(404);
    auth.mockResolvedValue({ user: { id: b.userId } });
    const initialized = await requestLegacy(b.userId);
    expect(initialized.status).toBe(301);
    expect((await fixtureSql()`SELECT visibility FROM founders WHERE user_id=${b.userId}`)[0].visibility).toBe("private");
  });
});
describe("administrator redirect management", () => {
  const rule = () => ({ id: randomUUID(), sourcePath: "/old-about", destinationPath: "/about", statusCode: 301 as const, enabled: true, expectedVersion: 0, reason: "Consolidate the old about address" });
  it("rechecks database roles, rejects moderator writes and requires a bound preview", async () => {
    const absent = await user(), moderator = await user("moderator"), admin = await user("admin"), input = rule();
    await expect(listManagedRedirects(absent)).rejects.toMatchObject({ status: 403 });
    await expect(previewRedirect(moderator, input)).rejects.toMatchObject({ status: 403 });
    const preview = await previewRedirect(admin, input);
    expect((await fixtureSql()`SELECT * FROM redirect_rules`).length).toBe(0);
    await expect(saveRedirect(absent, input, preview.token)).rejects.toMatchObject({ status: 403 });
    await expect(saveRedirect(admin, { ...input, destinationPath: "/pricing" }, preview.token)).rejects.toMatchObject({ status: 403 });
    await fixtureSql()`DELETE FROM admin_roles WHERE user_id=${admin.userId}`;
    await expect(saveRedirect(admin, input, preview.token)).rejects.toMatchObject({ status: 403 });
  });
  it("audits one mutation, accepts safe retry and immediately applies edits and disabling", async () => {
    const admin = await user("admin"), input = rule(), preview = await previewRedirect(admin, input);
    const results = await Promise.all([saveRedirect(admin, input, preview.token), saveRedirect(admin, input, preview.token)]);
    expect(results.map(x => x.replayed).sort()).toEqual([false, true]);
    expect(await resolveManagedRedirect(input.sourcePath)).toEqual({ path: "/about", status: 301 });
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM audit_logs WHERE action='redirect.save'`)[0].count).toBe(1);
    const disabled = { ...input, enabled: false, expectedVersion: 1 };
    await saveRedirect(admin, disabled, (await previewRedirect(admin, disabled)).token);
    expect(await resolveManagedRedirect(input.sourcePath)).toBeNull();
  });
  it("blocks chain races, loops, stale edits, external URLs and protected profile destinations", async () => {
    const admin = await user("admin"), a = rule(), b = { ...rule(), sourcePath: "/about", destinationPath: "/final" };
    const pa = await previewRedirect(admin, a), pb = await previewRedirect(admin, b);
    await saveRedirect(admin, a, pa.token);
    await expect(saveRedirect(admin, b, pb.token)).rejects.toMatchObject({ status: 409 });
    await expect(previewRedirect(admin, b)).rejects.toMatchObject({ status: 409 });
    await expect(previewRedirect(admin, { ...rule(), sourcePath: "/before", destinationPath: "/old-about" })).rejects.toMatchObject({ status: 409 });
    for (const destinationPath of ["https://evil.example/", "//evil.example", "/founder/private-person", "/api/auth", "/about?email=private"])
      await expect(previewRedirect(admin, { ...rule(), destinationPath })).rejects.toBeDefined();
    await expect(saveRedirect(admin, a, pa.token+"changed")).rejects.toMatchObject({ status: 400 });
  });
});

