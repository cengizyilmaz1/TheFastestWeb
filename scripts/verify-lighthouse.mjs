import lighthouse, { defaultConfig, desktopConfig } from "lighthouse";
import { launch } from "chrome-launcher";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3200");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Lighthouse checks require the isolated loopback runtime.");
await mkdir("test-results/lighthouse", { recursive: true });
const browser = await launch({ chromePath: process.env.CHROME_PATH || chromium.executablePath(), chromeFlags: ["--headless=new"] });
try {
  const summary = [];
  for (const preset of ["mobile", "desktop"]) {
    // `preset` is interpreted by Lighthouse's CLI, not its Node API flags.
    // Pass the official configuration as the third API argument instead.
    const config = preset === "desktop" ? desktopConfig : defaultConfig;
    const result = await lighthouse(base.href, { port: browser.port, logLevel: "error", output: ["html", "json"],
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"] }, config);
    if (!result || result.lhr.runtimeError) throw new Error("Lighthouse could not complete the isolated audit.");
    const effective = result.lhr.configSettings;
    if (effective.formFactor !== preset || ["mobile", "width", "height", "deviceScaleFactor", "disabled"]
      .some((key) => effective.screenEmulation[key] !== config.settings.screenEmulation[key])) {
      throw new Error("Lighthouse device configuration does not match the requested audit.");
    }
    await writeFile(`test-results/lighthouse/${preset}.html`, result.report[0]);
    await writeFile(`test-results/lighthouse/${preset}.json`, result.report[1]);
    summary.push({ preset, fetchedAt: result.lhr.fetchTime,
      configuration: { formFactor: effective.formFactor, screenEmulation: effective.screenEmulation, throttling: effective.throttling },
      categories: Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, value.score])),
      metrics: Object.fromEntries(["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift"].map((key) => [key, result.lhr.audits[key]?.numericValue])) });
  }
  const report = { environment: "isolated loopback production build; synthetic data; simulated Lighthouse throttling; demo intentionally noindex", results: summary };
  await writeFile("test-results/lighthouse/summary.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.kill(); }
