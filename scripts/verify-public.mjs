import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3100";
const output = resolve("test-results/public-smoke");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const report = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, colorScheme: "light", reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const routes = ["/", "/explore", "/explore?q=nonexistent-smoke-query", "/leaderboard", "/hall-of-fame", "/founders", "/test", "/submit", "/pricing", "/dashboard", "/auth/login", "/claim", "/about", "/methodology", "/blog", "/privacy", "/terms"];
    await page.goto(baseURL, { waitUntil: "networkidle", timeout: 90000 });
    const sites = page.locator('a[href^="/site/"]');
    const categories = page.locator('a[href^="/categories/"]');
    const site = await sites.count() ? await sites.first().getAttribute("href") : null;
    const category = await categories.count() ? await categories.first().getAttribute("href") : null;
    if (site) routes.push(site);
    if (category) routes.push(category);
    for (const route of routes) {
      errors.length = 0;
      const response = await page.goto(new URL(route, baseURL).href, { waitUntil: "networkidle", timeout: 90000 });
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const entry = {
        viewport: viewport.width, route, status: response?.status(),
        headingCount: await page.locator("h1").count(),
        horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        errors: [...errors], violations: result.violations.map((issue) => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })),
      };
      report.push(entry);
      console.log(JSON.stringify({ viewport: entry.viewport, route, status: entry.status, headingCount: entry.headingCount, horizontalOverflow: entry.horizontalOverflow, errors: errors.length, violations: entry.violations.map((issue) => issue.id) }));
      if (["/", "/explore", "/pricing", "/submit", site].includes(route)) await page.screenshot({ path: resolve(output, `${viewport.width}-${route.replace(/[^a-z0-9]/gi, "_") || "home"}.png`), fullPage: true });
    }
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Switch light or dark theme" }).click();
    await page.reload({ waitUntil: "networkidle" });
    if (await page.locator("html").getAttribute("data-theme") !== "dark") throw new Error("Theme selection did not persist.");
    const dark = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    report.push({ viewport: viewport.width, route: "/ (dark)", violations: dark.violations.map((issue) => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })) });
    await page.screenshot({ path: resolve(output, `${viewport.width}-home-dark.png`), fullPage: true });
    if (viewport.width < 1280) {
      const trigger = page.locator('button[aria-controls="mobile-navigation"]');
      await trigger.click();
      if (await trigger.getAttribute("aria-expanded") !== "true") throw new Error("Mobile navigation failed to open.");
      await page.keyboard.press("Escape");
      if (await trigger.getAttribute("aria-expanded") !== "false" || !await trigger.evaluate((element) => element === document.activeElement)) throw new Error("Mobile navigation failed to close or restore focus.");
    }
    await context.close();
  }
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
const failures = report.filter((entry) => (entry.status !== undefined && entry.status !== 200) || (entry.headingCount !== undefined && entry.headingCount !== 1) || entry.horizontalOverflow || entry.errors?.length || entry.violations?.length);
console.log(JSON.stringify({ checked: report.length, failures: failures.length, report: "test-results/public-smoke/report.json" }));
if (failures.length) process.exitCode = 1;
