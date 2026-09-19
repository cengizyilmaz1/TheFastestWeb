import { access, constants } from "node:fs/promises";
import { isAbsolute } from "node:path";
import sharp from "sharp";
import puppeteer, { type Browser } from "puppeteer-core";
import { createBrowserEgressProxy } from "../../src/infrastructure/browser/egress-proxy";
import { secureChromiumArgs } from "../../src/infrastructure/browser/render-html";
import { parsePublicHttpUrl, resolvePublicTarget } from "../../src/lib/security/public-url";
import type { PreparedCapture } from "./contracts";

const MAX_PIXELS = 16_000_000;
const MAX_OUTPUT_BYTES = 6 * 1024 * 1024;
const MAX_FULL_HEIGHT = 8000;
export class CaptureError extends Error {
  constructor(readonly code: "URL_BLOCKED" | "CAPTURE_TIMEOUT" | "CAPTURE_FAILED" | "CAPTURE_TOO_LARGE") { super(code); }
}
export type CapturedImages = { original: Buffer; optimized: Buffer; width: number; height: number; finalUrl: string; title: string };

/** Each bounded pool slot starts an isolated sandboxed process with its own proxy.
 * No cookies, profile, credentials, or service workers are reused between clients. */
export class CapturePool {
  private active = 0;
  private closing = false;
  private tasks = new Set<Promise<CapturedImages>>();
  constructor(private readonly executablePath: string, private readonly concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("Invalid browser capacity");
  }
  async capture(request: PreparedCapture): Promise<CapturedImages> {
    if (this.closing || this.active >= this.concurrency) throw new CaptureError("CAPTURE_FAILED");
    this.active++;
    const task = capture(request, this.executablePath);
    this.tasks.add(task);
    try { return await task; }
    finally { this.tasks.delete(task); this.active--; }
  }
  async close() { this.closing = true; await Promise.allSettled(this.tasks); }
}

async function capture(request: PreparedCapture, executablePath: string): Promise<CapturedImages> {
  if (process.platform !== "linux" || !isAbsolute(executablePath)) throw new CaptureError("CAPTURE_FAILED");
  await access(executablePath, constants.X_OK);
  try { await resolvePublicTarget(request.url); } catch { throw new CaptureError("URL_BLOCKED"); }
  const proxy = await createBrowserEgressProxy();
  let browser: Browser | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, pipe: true, args: secureChromiumArgs(proxy.url), timeout: 8000, protocolTimeout: 15_000,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8", TZ: "UTC",
        ...(process.env.CHROME_DEVEL_SANDBOX ? { CHROME_DEVEL_SANDBOX: process.env.CHROME_DEVEL_SANDBOX } : {}) } });
    const running = browser;
    deadline = setTimeout(() => { timedOut = true; running.process()?.kill("SIGKILL"); }, 20_000);
    const page = await browser.newPage();
    await page.setViewport({ ...request.viewport, deviceScaleFactor: 1, isMobile: request.device === "mobile", hasTouch: request.device === "mobile" });
    await page.setUserAgent(request.device === "mobile"
      ? "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36"
      : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36");
    await page.setCacheEnabled(false);
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    let requests = 0, navigations = 0;
    let mainBlocked = false;
    page.on("request", (pending) => {
      try {
        parsePublicHttpUrl(pending.url());
        if (++requests > 180 || (pending.isNavigationRequest() && ++navigations > 6) ||
          !["document", "stylesheet", "image", "font", "script", "xhr", "fetch"].includes(pending.resourceType())) throw new Error("Resource policy");
        void pending.continue().catch(() => undefined);
      } catch {
        if (pending.isNavigationRequest() && pending.frame() === page.mainFrame()) mainBlocked = true;
        void pending.abort().catch(() => undefined);
      }
    });
    page.on("popup", (popup) => { void popup?.close().catch(() => undefined); });
    const session = await page.createCDPSession();
    await session.send("Network.enable");
    await session.send("Network.setBlockedURLs", { urls: ["ws://*", "wss://*"] });
    await session.send("Browser.setDownloadBehavior", { behavior: "deny" });
    const response = await page.goto(request.url, { waitUntil: "networkidle2", timeout: 12_000 });
    if (!response?.ok() || mainBlocked) throw new CaptureError("CAPTURE_FAILED");
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
      htmlSize: document.documentElement.outerHTML.length,
    }));
    if (dimensions.htmlSize > 2 * 1024 * 1024 || dimensions.width > 10000 ||
      (request.mode === "fullpage" && (dimensions.height > MAX_FULL_HEIGHT || dimensions.width * dimensions.height > MAX_PIXELS))) throw new CaptureError("CAPTURE_TOO_LARGE");
    // Freeze the clip after validating dimensions: an untrusted page can grow
    // between measurement and capture, so fullPage must never resize it again.
    const clip = request.mode === "fullpage" ? { x: 0, y: 0, width: request.viewport.width,
      height: Math.max(request.viewport.height, dimensions.height) } : undefined;
    const original = Buffer.from(await page.screenshot({ type: "jpeg", quality: 86, clip, captureBeyondViewport: request.mode === "fullpage" }));
    if (original.length > MAX_OUTPUT_BYTES) throw new CaptureError("CAPTURE_TOO_LARGE");
    const output = await sharp(original, { limitInputPixels: MAX_PIXELS }).webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (output.data.length > MAX_OUTPUT_BYTES) throw new CaptureError("CAPTURE_TOO_LARGE");
    return { original, optimized: output.data, width: output.info.width, height: output.info.height,
      finalUrl: parsePublicHttpUrl(page.url()).href, title: (await page.title()).slice(0, 512) };
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError(timedOut ? "CAPTURE_TIMEOUT" : "CAPTURE_FAILED");
  } finally {
    clearTimeout(deadline);
    if (browser) {
      const kill = setTimeout(() => browser?.process()?.kill("SIGKILL"), 2000);
      try { await browser.close(); } catch { browser.process()?.kill("SIGKILL"); }
      finally { clearTimeout(kill); }
    }
    await proxy.close();
  }
}
