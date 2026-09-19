import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { encode } from "next-auth/jwt";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3200");
const origin = new URL(process.env.AUTH_URL || process.env.SITE_URL || "https://demo.example.invalid").origin;
const adminId = process.env.SMOKE_ADMIN_USER_ID, founderId = process.env.SMOKE_FOUNDER_USER_ID;
const siteId = process.env.SMOKE_SITE_ID, founderSlug = process.env.SMOKE_FOUNDER_SLUG;
const secret = process.env.AUTH_SECRET;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || !origin.endsWith(".invalid")
  || !adminId || !founderId || !siteId || ![adminId, founderId, siteId].every((id) => uuid.test(id))
  || !founderSlug || !/^(?:synthetic|smoke)-[a-z0-9-]+$/.test(founderSlug) || !secret || secret.length < 32) {
  throw new Error("Private browser checks require an isolated loopback runtime and explicitly supplied synthetic fixture actors.");
}
const output = resolve("test-results/private-smoke"), report = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });

async function context(userId, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, reducedMotion: "reduce", colorScheme: "light" });
  const session = await encode({ secret, token: { dbUserId: userId }, maxAge: 3600 });
  // Exercise secure auth cookies and Origin checks against the synthetic HTTPS
  // app origin; all transport is intercepted to the isolated loopback runtime.
  await ctx.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    // allHeaders() can wait for Chromium's extra-info event while this synthetic
    // HTTPS request is paused. Use immediately available headers and this test
    // actor's in-memory session cookie; never log request/response headers.
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
async function dashboard(page) {
  const response = await page.goto(origin + "/dashboard", { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (response?.status() !== 200) throw new Error("Authenticated dashboard did not load.");
  await page.getByRole("heading", { name: "Founder collaborations", exact: true }).waitFor();
  await page.getByText("Loading collaboration records…", { exact: true }).waitFor({ state: "hidden" });
  if (await page.getByText("Collaboration records are temporarily unavailable.", { exact: true }).count()) throw new Error("Collaboration API could not load.");
}
try {
  // This separates a real server/query failure from the browser routing helper.
  const probeSession = await encode({ secret, token: { dbUserId: adminId }, maxAge: 3600 });
  for (const path of ["/dashboard", "/admin"]) {
    const started = Date.now();
    const probe = await fetch(new URL(path, base), { headers: { cookie: `__Secure-next-auth.session-token=${probeSession}` }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    await probe.arrayBuffer();
    console.log(JSON.stringify({ event: "private_smoke.direct_probe", path, status: probe.status, durationMs: Date.now() - started }));
    if (probe.status !== 200) throw new Error("Authenticated direct runtime probe failed.");
  }
  for (const width of [1440, 390]) {
    const ctx = await context(adminId, width), page = await ctx.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const path of ["/dashboard", "/admin"]) {
      errors.length = 0;
      if (path === "/dashboard") await dashboard(page);
      else {
        const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
        if (response?.status() !== 200) throw new Error("Synthetic administrator could not open the panel.");
      }
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const entry = { width, path, mainCount: await page.locator("main").count(), headingCount: await page.locator("h1").count(),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), errors: [...errors],
        violations: result.violations.map((issue) => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })) };
      report.push(entry);
      await page.screenshot({ path: resolve(output, `${width}-${path.slice(1)}.png`), fullPage: true });
      console.log(JSON.stringify({ width, path, mainCount: entry.mainCount, headingCount: entry.headingCount, overflow: entry.overflow, errors: errors.length, violations: entry.violations.map((issue) => issue.id) }));
    }
    await ctx.close();
  }

  const owner = await context(adminId, 1440), recipient = await context(founderId, 1440);
  const ownerPage = await owner.newPage(), recipientPage = await recipient.newPage();
  await dashboard(ownerPage);
  const section = ownerPage.locator("section").filter({ has: ownerPage.getByRole("heading", { name: "Founder collaborations", exact: true }) });
  // The implicit label contains the select's option text as well. Scope its
  // single combobox to this section rather than requiring an exact label string.
  await section.getByRole("combobox").selectOption(siteId);
  await section.getByLabel("Public founder slug", { exact: true }).fill(founderSlug);
  await section.getByRole("button", { name: "Invite founder", exact: true }).click();
  await section.getByText("Invitation recorded. The founder can respond from their dashboard.", { exact: true }).waitFor();
  await dashboard(recipientPage);
  await recipientPage.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await recipientPage.getByText("Invitation accepted. Your founder profile is now associated with this website.", { exact: true }).waitFor();
  await dashboard(ownerPage);
  const founderLink = section.locator(`a[href="/founders/${founderSlug}"]`);
  await founderLink.waitFor();
  await founderLink.locator("xpath=ancestor::li").getByRole("button", { name: "Remove attribution", exact: true }).click();
  await section.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await section.getByText("Founder attribution removed.", { exact: true }).waitFor();
  await founderLink.waitFor({ state: "hidden" });
  await dashboard(recipientPage);
  if (await recipientPage.getByRole("button", { name: "Leave attribution", exact: true }).count()) throw new Error("Removed attribution still appears to the invited founder.");
  report.push({ interaction: "founder-invite-accept-remove", passed: true });
  await owner.close(); await recipient.close();
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
const failures = report.filter((entry) => entry.mainCount !== undefined && (entry.mainCount !== 1 || entry.headingCount !== 1 || entry.overflow || entry.errors.length || entry.violations.length));
console.log(JSON.stringify({ checked: report.length, failures: failures.length, report: "test-results/private-smoke/report.json" }));
if (failures.length) process.exitCode = 1;
