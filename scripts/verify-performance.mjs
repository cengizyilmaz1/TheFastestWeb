import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3200");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || process.env.SMOKE_SYNTHETIC_FIXTURE !== "true") {
  throw new Error("Performance interaction checks require the isolated synthetic runtime.");
}
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const report = [];
function check(name, passed, details) { report.push({ name, passed, ...details }); if (!passed) throw new Error(name); }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base.href, { waitUntil: "networkidle" });
  const images = page.locator('img[src^="/_next/image?"]');
  const optimized = await images.evaluateAll(elements => elements.map(image => ({ width: image.width, loaded: image.complete && image.naturalWidth > 0 })));
  check("seven-small-local-images-optimized", optimized.length === 7 && optimized.every(image => image.loaded && image.width <= 32), { images: optimized });
  check("advertisement-dialog-absent-before-interaction", await page.getByRole("dialog").count() === 0);
  const trigger = page.getByRole("button", { name: /Advertise$/ }).first();
  await trigger.click();
  await page.getByRole("dialog", { name: "Get Featured" }).waitFor();
  await page.getByRole("button", { name: "Close advertisement checkout" }).waitFor();
  await expect(page.getByRole("button", { name: "Close advertisement checkout" })).toBeFocused();
  check("lazy-advertisement-dialog-focus", await page.getByRole("button", { name: "Close advertisement checkout" }).evaluate(node => node === document.activeElement));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  check("dialog-close-restores-trigger-focus", await page.getByRole("dialog").count() === 0 && await trigger.evaluate(node => node === document.activeElement));
  await page.setViewportSize({ width: 390, height: 250 });
  await page.goto(new URL("/site/synthetic-smoke", base).href, { waitUntil: "networkidle" });
  check("chart-below-fold-deferred", await page.locator(".recharts-wrapper").count() === 0);
  await page.getByRole("group", { name: "Performance history range" }).scrollIntoViewIfNeeded();
  await page.locator(".recharts-wrapper svg").waitFor();
  check("chart-renders-on-scroll", await page.locator(".recharts-area-curve").count() === 1);
  await page.getByRole("button", { name: "7D", exact: true }).click();
  check("history-range-remains-interactive", await page.getByRole("button", { name: "7D", exact: true }).getAttribute("aria-pressed") === "true");
  check("no-client-errors", errors.length === 0, { errors });
} finally {
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/performance-interactions.json", JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ performanceInteractions: report.length, passed: report.every(item => item.passed) }));
