import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { encode } from "next-auth/jwt";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3200");
const origin = new URL(process.env.AUTH_URL || process.env.SITE_URL || "https://demo.example.invalid").origin;
const ownerId = process.env.SMOKE_ADMIN_USER_ID, founderId = process.env.SMOKE_FOUNDER_USER_ID, privateId = process.env.SMOKE_PRIVATE_USER_ID;
const siteId = process.env.SMOKE_SITE_ID, founderSlug = process.env.SMOKE_FOUNDER_SLUG;
const secret = process.env.AUTH_SECRET;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || !origin.endsWith(".invalid")
  || !ownerId || !founderId || !privateId || !siteId || ![ownerId, founderId, privateId, siteId].every((id) => uuid.test(id))
  || !founderSlug || !/^(?:synthetic|smoke)-[a-z0-9-]+$/.test(founderSlug) || !secret || secret.length < 32) {
  throw new Error("Private checks require an isolated loopback runtime and explicitly supplied synthetic fixture actors.");
}
const output = resolve("test-results/private-smoke"), report = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const sessions = new Map();
async function sessionFor(userId) {
  if (!sessions.has(userId)) sessions.set(userId, await encode({ secret, token: { dbUserId: userId }, maxAge: 3600 }));
  return sessions.get(userId);
}
async function context(userId, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, reducedMotion: "reduce", colorScheme: "dark" });
  const session = await sessionFor(userId);
  // The secure synthetic origin is transported only to the isolated loopback
  // runtime. Cookie/header contents and actor records never enter the report.
  await ctx.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    try {
      const response = await route.fetch({ url: new URL(url.pathname + url.search, base).href,
        headers: { ...request.headers(), host: base.host, cookie: `__Secure-next-auth.session-token=${session}` }, maxRedirects: 0, timeout: 30_000 });
      await route.fulfill({ response });
    } catch {
      console.error(JSON.stringify({ event: "private_smoke.transport_failed", resource: request.resourceType(), method: request.method() }));
      await route.abort("failed");
    }
  });
  await ctx.addCookies([{ name: "__Secure-next-auth.session-token", value: session,
    domain: new URL(origin).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
  return ctx;
}
async function api(userId, method = "GET", body, requestOrigin = origin) {
  const response = await fetch(new URL("/api/founders/collaborations", base), {
    method, redirect: "manual", signal: AbortSignal.timeout(30_000),
    headers: { ...(userId ? { cookie: `__Secure-next-auth.session-token=${await sessionFor(userId)}` } : {}),
      ...(requestOrigin ? { origin: requestOrigin } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
}
function assert(condition, message) { if (!condition) throw new Error(message); }
const adminPages = ["/admin", "/admin/users", "/admin/websites", "/admin/ads", "/admin/payments", "/admin/audit", "/admin/redirects"];
try {
  for (const width of [1440, 390]) {
    const ctx = await context(ownerId, width), page = await ctx.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [label, path] of [["submit", "/submit"], ["public-owner-profile", `/profile/${ownerId}`], ...adminPages.map((path) => [`admin${path.slice(6).replace("/", "-")}`, path])]) {
      errors.length = 0;
      const response = await page.goto(origin + path, { waitUntil: "networkidle", timeout: 45_000 });
      assert(response?.status() === 200, "An authenticated original page did not load.");
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const entry = { width, page: label, mainCount: await page.locator("main").count(), headingCount: await page.locator("h1").count(),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), errors: [...errors],
        violations: result.violations.map((issue) => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })) };
      report.push(entry);
      await page.screenshot({ path: resolve(output, `${width}-${label}.png`), fullPage: true });
      console.log(JSON.stringify({ width, page: label, mainCount: entry.mainCount, headingCount: entry.headingCount, overflow: entry.overflow, errors: errors.length, violations: entry.violations.map((issue) => issue.id) }));
    }
    await ctx.close();

    const privateContext = await context(privateId, width), privatePage = await privateContext.newPage();
    const privateErrors = [];
    privatePage.on("pageerror", (error) => privateErrors.push(error.message));
    await privatePage.goto(origin + "/", { waitUntil: "networkidle", timeout: 45_000 });
    // Exercise the actual account-menu destination with an unpublished profile.
    const response = await privatePage.goto(origin + `/profile/${privateId}`, { waitUntil: "networkidle", timeout: 45_000 });
    assert(response?.status() === 200, "My Profile returned an error for its authenticated owner.");
    assert(await privatePage.getByText("Only you can see this profile.", { exact: true }).isVisible(), "Private profile notice is absent.");
    assert((await privatePage.locator('meta[name="robots"]').getAttribute("content"))?.includes("noindex"), "Private profile was indexable.");
    const privateAxe = await new AxeBuilder({ page: privatePage }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    report.push({ width, page: "private-my-profile", mainCount: await privatePage.locator("main").count(), headingCount: await privatePage.locator("h1").count(),
      overflow: await privatePage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), errors: privateErrors,
      violations: privateAxe.violations.map((issue) => ({ id: issue.id, impact: issue.impact })) });
    await privatePage.screenshot({ path: resolve(output, `${width}-private-my-profile.png`), fullPage: true });
    await privateContext.close();
  }

  // Restored profile pages still respect opt-in visibility and exclude private
  // account fields, independently of the browser's authenticated navigation.
  for (const [id, expected] of [[ownerId, 301], [privateId, 404]]) {
    const response = await fetch(new URL(`/profile/${id}`, base), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const html = await response.text();
    assert(response.status === expected, "Profile publication boundary changed.");
    if (expected === 301) {
      const destination = new URL(response.headers.get("location"));
      assert(destination.origin === origin && /^\/founder\/[a-z0-9-]+$/.test(destination.pathname), "Legacy profile did not point to its canonical username.");
      const canonical = await fetch(new URL(destination.pathname, base), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
      assert(canonical.status === 200, "Canonical public founder page did not load.");
      const publicHtml = await canonical.text();
      for (const email of ["smoke@example.invalid", "collaborator@example.invalid", "private-smoke@example.invalid"])
        assert(!publicHtml.includes(email), "A canonical founder page exposed an account email.");
    }
    for (const email of ["smoke@example.invalid", "collaborator@example.invalid", "private-smoke@example.invalid"])
      assert(!html.includes(email), "An anonymous profile response exposed an account email.");
  }
  report.push({ interaction: "profile-visibility-and-account-privacy", passed: true });
  const otherProfile = await fetch(new URL(`/profile/${privateId}`, base), { redirect: "manual", signal: AbortSignal.timeout(30_000),
    headers: { cookie: `__Secure-next-auth.session-token=${await sessionFor(ownerId)}` } });
  await otherProfile.arrayBuffer();
  assert(otherProfile.status === 404, "An account could read another account's private profile.");
  report.push({ interaction: "private-profile-account-isolation", passed: true });
  for (const userId of [null, founderId]) for (const path of adminPages) {
    const response = await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(30_000),
      headers: userId ? { cookie: `__Secure-next-auth.session-token=${await sessionFor(userId)}` } : {} });
    await response.arrayBuffer();
    assert(response.status === 404, `A non-administrator could open ${path}.`);
    assert(/no-store|no-cache/.test(response.headers.get("cache-control") ?? ""), `${path} allowed caching.`);
  }
  report.push({ interaction: "admin-panel-authorization", passed: true });

  // The collaboration dashboard was removed with the additional pages. Keep
  // its authorization and state-transition coverage at the unchanged API.
  assert((await api(null)).status === 401, "Collaboration API accepted an anonymous request.");
  const invitationBody = { siteId, founderSlug };
  assert((await api(ownerId, "POST", invitationBody, null)).status === 403, "Mutation without an Origin was accepted.");
  assert((await api(ownerId, "POST", invitationBody, "https://other.example.invalid")).status === 403, "Cross-origin mutation was accepted.");
  assert((await api(founderId, "POST", invitationBody)).status === 404, "A non-owner could invite a founder to another owner's site.");
  const invitation = await api(ownerId, "POST", invitationBody);
  assert(invitation.status === 200 && invitation.body.status === "pending" && uuid.test(invitation.body.id), "Owner invitation was not recorded.");
  assert((await api(ownerId, "PATCH", { invitationId: invitation.body.id, decision: "accept" })).status === 404, "The inviter accepted someone else's invitation.");
  const accepted = await api(founderId, "PATCH", { invitationId: invitation.body.id, decision: "accept" });
  assert(accepted.status === 200 && accepted.body.status === "accepted" && accepted.body.linked === true, "The invited founder could not accept.");
  const owned = await api(ownerId), recipient = await api(founderId);
  assert(owned.status === 200 && recipient.status === 200 && owned.cache?.includes("no-store") && recipient.cache?.includes("no-store"), "Private collaboration results were cacheable or unavailable.");
  const attribution = owned.body.ownedSites.find((site) => site.id === siteId)?.founders.find((founder) => founder.slug === founderSlug);
  assert(attribution && recipient.body.ownLinks.some((link) => link.site.id === siteId), "Accepted attribution is missing.");
  const removed = await api(ownerId, "DELETE", { siteId, founderId: attribution.id });
  assert(removed.status === 200 && removed.body.removed === true, "Owner could not remove attribution.");
  const afterRemoval = await api(founderId);
  assert(!afterRemoval.body.ownLinks.some((link) => link.site.id === siteId), "Removed attribution remains visible to the founder.");
  const replay = await api(founderId, "PATCH", { invitationId: invitation.body.id, decision: "accept" });
  assert(replay.status === 200 && replay.body.linked === false, "A consumed invitation recreated removed attribution.");
  report.push({ interaction: "collaboration-origin-ownership-invite-accept-remove-replay", passed: true });
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
const failures = report.filter((entry) => entry.mainCount !== undefined && (entry.mainCount !== 1 || entry.headingCount !== 1 || entry.overflow || entry.errors.length || entry.violations.length));
console.log(JSON.stringify({ checked: report.length, failures: failures.length, report: "test-results/private-smoke/report.json" }));
if (failures.length) process.exitCode = 1;
