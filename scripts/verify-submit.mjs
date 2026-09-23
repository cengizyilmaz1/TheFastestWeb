import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { encode } from "next-auth/jwt";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3200");
const origin = new URL(process.env.AUTH_URL || process.env.SITE_URL || "https://demo.example.invalid").origin;
const userId = process.env.SMOKE_ADMIN_USER_ID, secret = process.env.AUTH_SECRET;
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || !new URL(origin).hostname.endsWith(".invalid")
  || process.env.SMOKE_SYNTHETIC_FIXTURE !== "true" || !/^[a-f0-9-]{36}$/i.test(userId ?? "") || !secret || secret.length < 32) {
  throw new Error("Submit browser checks require an isolated loopback runtime and a synthetic authenticated fixture.");
}

const report = [], output = resolve("test-results/submit-smoke");
await mkdir(output, { recursive: true });
const session = await encode({ secret, token: { dbUserId: userId }, maxAge: 3600 });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const proof = { score: 91, fcp: "0.8 s", lcp: "1.2 s", clsDisplay: "0.02", tbt: "30 ms", tti: "Unavailable", si: "1.1 s",
  fcpScore: .95, lcpScore: .92, clsScore: .99, tbtScore: .96, ttiScore: null, siScore: .94 };
const receipt = { id: "00000000-0000-4000-8000-000000000001", status: "succeeded",
  metadata: { title: "Synthetic autofill site", description: "A useful synthetic website description.", suggestedCategory: null },
  mobile: { id: "00000000-0000-4000-8000-000000000002", result: proof },
  desktop: { id: "00000000-0000-4000-8000-000000000003", result: proof } };

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, reducedMotion: "reduce", colorScheme: "dark" });
    await context.addCookies([{ name: "__Secure-next-auth.session-token", value: session, domain: new URL(origin).hostname,
      path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
    let preparations = 0, receiptReads = 0, publication = null, releaseMetadata, metadataStarted;
    const metadataRequested = new Promise(resolve => { metadataStarted = resolve; });
    const metadataGate = new Promise(resolve => { releaseMetadata = resolve; });
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      const json = value => route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
      if (url.pathname === "/api/submissions" && request.method() === "POST") { preparations++; return json({ jobId: receipt.id }); }
      if (url.pathname === `/api/submissions/${receipt.id}`) {
        receiptReads++;
        return json(receiptReads === 1 ? { ...receipt, status: "queued", mobile: null, desktop: null } : receipt);
      }
      if (url.pathname === "/api/submit" && request.method() === "GET") {
        metadataStarted(); await metadataGate;
        return json({ title: "Late website title", description: "Late website description that must not replace edits.", suggestedCategory: "tool" });
      }
      if (url.pathname === "/api/verify-badge") return json({ verified: true });
      if (url.pathname === "/api/submit" && request.method() === "POST") {
        publication = request.postDataJSON();
        return json({ success: true, slug: "synthetic-form-result" });
      }
      // No checkout, analytics mutation, email, preparation or publication can
      // escape these synthetic fixtures, including new future form endpoints.
      if (!["GET", "HEAD"].includes(request.method())) return route.abort("blockedbyclient");
      try {
        const response = await route.fetch({ url: new URL(url.pathname + url.search, base).href,
          headers: { ...request.headers(), host: base.host, cookie: `__Secure-next-auth.session-token=${session}` }, maxRedirects: 0, timeout: 30_000 });
        return route.fulfill({ response });
      } catch { return route.abort("failed"); }
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/submit", { waitUntil: "networkidle" });
    await page.locator("#submit-url").fill("https://submit.example.org");
    await page.getByRole("button", { name: "Test Speed & Continue" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your website measurement is queued." })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/\d+%/);
    await expect(page.locator("#submit-name")).toHaveValue("Synthetic autofill site");
    await expect(page.locator("#submit-description")).toHaveValue(receipt.metadata.description);
    await expect(page.locator("#submit-category")).toHaveValue("");
    await expect(page.locator("#submit-country-value")).toContainText("Choose a country");
    const submit = page.locator("form button[type=submit]");
    await submit.click();
    expect(publication).toBe(null); expect(preparations).toBe(1);
    await page.locator("#submit-category").selectOption("tool");
    await page.locator("#submit-description").fill("");
    await submit.click();
    expect(publication).toBe(null); expect(preparations).toBe(1);
    await page.locator("#submit-description").fill("A valid description to test required country.");
    await submit.click();
    await expect(page.locator("#submit-country-error")).toBeVisible();
    expect(publication).toBe(null); expect(preparations).toBe(1);

    await page.getByRole("button", { name: "Auto-fill from website" }).click();
    await metadataRequested;
    await page.locator("#submit-name").fill("My edited product");
    await page.locator("#submit-description").fill("My handwritten description must remain unchanged.");
    await page.locator("#submit-category").selectOption("portfolio");
    releaseMetadata();
    await expect(page.getByRole("status").filter({ hasText: "Your edits have been kept" })).toBeVisible();
    await expect(page.locator("#submit-name")).toHaveValue("My edited product");
    await expect(page.locator("#submit-description")).toHaveValue("My handwritten description must remain unchanged.");
    await expect(page.locator("#submit-category")).toHaveValue("portfolio");
    // Recreate both the inline and form-level country error immediately before
    // correcting it, so earlier field edits cannot mask a stale error regression.
    await submit.click();
    await expect(page.getByText("Choose your product's country of origin.", { exact: true })).toHaveCount(2);
    await page.locator("#submit-country").click();
    await page.getByRole("combobox", { name: "Search countries" }).fill("Turkey");
    await page.locator("#submit-country-option-TR").click();
    await expect(page.getByText("Choose your product's country of origin.", { exact: true })).toHaveCount(0);
    await expect(page.locator("#submit-country-error")).toHaveCount(0);
    await expect(page.locator("#submit-twitterHandle")).not.toHaveAttribute("required");
    await expect(page.locator("#submit-faviconUrl")).not.toHaveAttribute("required");
    const accessibility = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await page.screenshot({ path: resolve(output, `${width}-review.png`), fullPage: true });
    expect(overflow).toBe(false);
    expect(accessibility.violations.map(issue => issue.id)).toEqual([]);
    await submit.click();
    await expect.poll(() => publication).not.toBe(null);
    expect(publication).toMatchObject({ name: "My edited product", description: "My handwritten description must remain unchanged.",
      category: "portfolio", countryCode: "TR", preparationId: receipt.id, testResultId: receipt.mobile.id, desktopTestResultId: receipt.desktop.id });
    expect(errors).toEqual([]);
    report.push({ width, requiredFields: true, editableAutofill: true, delayedResponsePreservesEdits: true, confirmedPreparationStatus: true,
      serverReceipts: true, overflow, accessibilityViolations: accessibility.violations.length });
    console.log(JSON.stringify(report.at(-1)));
    await context.close();
  }
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
