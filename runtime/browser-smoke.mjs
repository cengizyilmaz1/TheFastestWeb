import puppeteer from "puppeteer-core";

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    timeout: 15000,
  });
  const page = await browser.newPage();
  // Local static content only: deployment smoke must not contact customer sites.
  await page.setContent("<!doctype html><title>Browser sandbox smoke</title>");
  if (await page.title() !== "Browser sandbox smoke") throw new Error("Unexpected browser output");
  process.stdout.write(JSON.stringify({
    event: "browser.smoke_passed", browser: await browser.version(), uid: process.getuid?.(),
  }) + "\n");
} catch (error) {
  const sandbox = error instanceof Error && /sandbox|namespace|operation not permitted/i.test(error.message);
  process.stderr.write(JSON.stringify({
    event: "browser.smoke_failed", code: sandbox ? "BROWSER_SANDBOX_UNAVAILABLE" : "BROWSER_UNAVAILABLE",
  }) + "\n");
  process.exitCode = 1;
} finally {
  await browser?.close();
}
