import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "parse5";

const baseURL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3100";
const output = resolve("test-results/public-smoke");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const report = [];
const badgeHref = "https://www.scrolllaunch.com/products/thefastestweb?ref=badge";
const badgeImage = "https://www.scrolllaunch.com/api/badge/thefastestweb";
function descendants(node) {
  return [node, ...(node.childNodes || []).flatMap(descendants)];
}
function attribute(node, name) { return node?.attrs?.find((item) => item.name === name)?.value; }
function badgeInInitialHtml(html) {
  const footer = descendants(parse(html)).find((node) => node.tagName === "footer");
  if (!footer) return false;
  const anchors = descendants(footer).filter((node) => node.tagName === "a" && attribute(node, "href") === badgeHref);
  const image = anchors.length === 1 && anchors[0].childNodes?.find((node) => node.tagName === "img");
  return Boolean(image && attribute(anchors[0], "target") === "_blank" && attribute(anchors[0], "rel") === "noopener"
    && attribute(image, "src") === badgeImage && attribute(image, "alt") === "Featured on ScrollLaunch"
    && attribute(image, "width") === "220" && attribute(image, "height") === "48" && attribute(image, "loading") === "lazy");
}
const retiredRoutes = ["/explore", "/leaderboard", "/founders", "/categories/saas", "/technologies/nextjs", "/countries/tr", "/compare", "/compare/synthetic-peer~vs~synthetic-smoke", "/featured", "/hall-of-fame", "/weekly/2026-W38", "/monthly/2026-09", "/methodology", "/dashboard", "/claim", "/unsubscribe"];
try {
  const initial = await fetch(new URL("/", baseURL), { signal: AbortSignal.timeout(45_000) });
  report.push({ route: "/", check: "scrolllaunch-badge-in-server-footer", status: initial.status, expectedStatus: 200,
    passed: badgeInInitialHtml(await initial.text()) });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const routes = ["/", "/test", "/submit", "/pricing", "/auth/login", "/about", "/blog", "/privacy", "/terms",
      ...["saas", "tool", "directory", "portfolio", "blog", "other"].map((category) => `/fastest/${category}`),
      ...["perfect", "90-plus", "80-plus"].map((tier) => `/leaderboard/${tier}`)];
    await page.goto(baseURL, { waitUntil: "networkidle", timeout: 90000 });
    const sites = page.locator('a[href^="/site/"]');
    const site = await sites.count() ? await sites.first().getAttribute("href") : null;
    if (site) routes.push(site);
    await page.goto(new URL("/blog", baseURL).href, { waitUntil: "networkidle", timeout: 90000 });
    const articles = page.locator('a[href^="/blog/"]');
    const article = await articles.count() ? await articles.first().getAttribute("href") : null;
    if (article) routes.push(article);
    for (const route of routes) {
      errors.length = 0;
      const response = await page.goto(new URL(route, baseURL).href, { waitUntil: "networkidle", timeout: 90000 });
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const entry = {
        viewport: viewport.width, route, status: response?.status(), expectedStatus: 200,
        headingCount: await page.locator("h1").count(),
        horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        errors: [...errors], violations: result.violations.map((issue) => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })),
      };
      report.push(entry);
      if (route === "/") {
        const badge = page.locator(`footer a[href="${badgeHref}"]`);
        let dimensions = null, visible = false;
        if (await badge.count() === 1 && await badge.isVisible()) {
          const image = badge.locator("img");
          await image.scrollIntoViewIfNeeded();
          dimensions = await image.boundingBox();
          visible = await image.isVisible() && await image.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return Boolean(hit && node.closest("a")?.contains(hit) && rect.left >= 0 && rect.right <= innerWidth
              && getComputedStyle(node).opacity !== "0");
          });
        }
        report.push({ viewport: viewport.width, route, check: "scrolllaunch-badge-visible-compact-size", dimensions,
          passed: Boolean(visible && dimensions && Math.abs(dimensions.width - 176) <= 1 && Math.abs(dimensions.height - 38.4) <= 1) });
      }
      console.log(JSON.stringify({ viewport: entry.viewport, route, status: entry.status, headingCount: entry.headingCount, horizontalOverflow: entry.horizontalOverflow, errors: errors.length, violations: entry.violations.map((issue) => issue.id) }));
      if (["/", "/pricing", "/submit", site].includes(route)) await page.screenshot({ path: resolve(output, `${viewport.width}-${route.replace(/[^a-z0-9]/gi, "_") || "home"}.png`), fullPage: true });
    }
    await page.goto(baseURL, { waitUntil: "networkidle" });
    // The restored interface has one dark palette and the original toggle menu.
    if (viewport.width < 769) {
      const trigger = page.getByRole("button", { name: "Menu", exact: true });
      const menu = trigger.locator("..");
      await trigger.click();
      const leaderboard = menu.getByRole("link", { name: "Leaderboard", exact: true });
      await leaderboard.waitFor({ state: "visible" });
      await trigger.click();
      await leaderboard.waitFor({ state: "hidden" });
      report.push({ viewport: viewport.width, interaction: "original-mobile-menu-open-close", passed: true });
    }
    await context.close();
  }
  for (const route of [...retiredRoutes, "/admin"]) {
    const response = await fetch(new URL(route, baseURL), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    await response.arrayBuffer();
    report.push({ route, status: response.status, expectedStatus: 404 });
  }
  const founderAlias = await fetch(new URL("/founders/smoke-owner", baseURL), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  await founderAlias.arrayBuffer();
  const founderLocation = founderAlias.headers.get("location");
  const founderPath = founderLocation ? new URL(founderLocation, baseURL).pathname : null;
  report.push({ route: "/founders/smoke-owner", status: founderAlias.status, expectedStatus: 301,
    passed: founderPath === "/founder/smoke-owner" });
  if (founderPath === "/founder/smoke-owner") {
    // Keep synthetic canonical hosts on the local fixture server.
    const canonical = await fetch(new URL(founderPath, baseURL), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    await canonical.arrayBuffer();
    report.push({ route: founderPath, status: canonical.status, expectedStatus: 200 });
  }
  // These original utility pages are deliberately excluded from search indexing.
  for (const route of ["/badge-preview", "/links"]) {
    const response = await fetch(new URL(route, baseURL), { signal: AbortSignal.timeout(30_000) });
    const html = await response.text();
    report.push({ route, status: response.status, expectedStatus: 200, passed: /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(html) });
  }
  const preview = await fetch(new URL("/email-preview", baseURL), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  await preview.arrayBuffer();
  report.push({ route: "/email-preview", status: preview.status, expectedStatus: 404 });
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
const failures = report.filter((entry) => (entry.status !== undefined && entry.status !== entry.expectedStatus) || (entry.headingCount !== undefined && entry.headingCount !== 1) || entry.horizontalOverflow || entry.errors?.length || entry.violations?.length || entry.passed === false);
console.log(JSON.stringify({ checked: report.length, failures: failures.length, report: "test-results/public-smoke/report.json" }));
if (failures.length) process.exitCode = 1;
