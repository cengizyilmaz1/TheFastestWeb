import { access, constants } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { getEnv } from "@/config/env";
import { parsePublicHttpUrl } from "@/lib/security/public-url";
import { createBrowserEgressProxy } from "./egress-proxy";

const MAX_ACTIVE_BROWSERS = 2;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
let activeBrowsers = 0;

export class BrowserUnavailableError extends Error {
  constructor(message = "Secure browser rendering is temporarily unavailable.") {
    super(message);
    this.name = "BrowserUnavailableError";
  }
}

export function secureChromiumArgs(proxyUrl: string): string[] {
  return [
    `--proxy-server=${proxyUrl}`,
    "--proxy-bypass-list=<-loopback>",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    "--disable-quic",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-extensions",
    "--disable-sync",
    "--disable-default-apps",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
  ];
}

/** No browser download, Vercel branch, shared cookies, or sandbox opt-out. */
export async function renderPublicHtml(input: string): Promise<{ url: string; html: string }> {
  const url = parsePublicHttpUrl(input);
  const executablePath = getEnv().CHROMIUM_EXECUTABLE_PATH;
  if (process.platform !== "linux" || !executablePath || !isAbsolute(executablePath)) {
    throw new BrowserUnavailableError("A preinstalled Linux Chromium executable is required.");
  }
  await access(executablePath, constants.X_OK).catch(() => { throw new BrowserUnavailableError(); });
  if (activeBrowsers >= MAX_ACTIVE_BROWSERS) throw new BrowserUnavailableError("Browser concurrency limit reached.");
  activeBrowsers++;
  let browser: import("puppeteer-core").Browser | undefined;
  let proxy: Awaited<ReturnType<typeof createBrowserEgressProxy>> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  try {
    proxy = await createBrowserEgressProxy();
    const puppeteer = await import("puppeteer-core");
    browser = await puppeteer.default.launch({
      executablePath,
      args: secureChromiumArgs(proxy.url),
      headless: true,
      pipe: true,
      timeout: 10_000,
      protocolTimeout: 15_000,
    });
    const runningBrowser = browser;
    // Kill is a last resort for a renderer that fails to finish/close on time.
    lifetime = setTimeout(() => { runningBrowser.process()?.kill("SIGKILL"); }, 20_000);
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setBypassServiceWorker(true);
    await page.setUserAgent("TheFastestWebBot/2.0");
    await page.setViewport({ width: 1280, height: 800 });
    await page.setRequestInterception(true);
    let requests = 0;
    let navigations = 0;
    let essentialRequestFailed = false;
    const essentialResources = new Set(["document", "script", "xhr", "fetch"]);
    page.on("request", (request) => {
      try {
        parsePublicHttpUrl(request.url());
        if (++requests > 100 ||
            (request.isNavigationRequest() && ++navigations > 6) ||
            !["document", "stylesheet", "script", "xhr", "fetch"].includes(request.resourceType())) {
          void request.abort().catch(() => undefined);
          return;
        }
        void request.continue().catch(() => undefined);
      } catch {
        void request.abort().catch(() => undefined);
      }
    });
    page.on("requestfailed", (request) => {
      if (essentialResources.has(request.resourceType())) essentialRequestFailed = true;
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && essentialResources.has(response.request().resourceType())) {
        essentialRequestFailed = true;
      }
    });
    const session = await page.createCDPSession();
    await session.send("Network.enable");
    await session.send("Network.setBlockedURLs", { urls: ["ws://*", "wss://*"] });
    const navigation = await page.goto(url.href, { waitUntil: "networkidle2", timeout: 12_000 });
    if (!navigation?.ok() || essentialRequestFailed) throw new BrowserUnavailableError();
    // Bound data crossing the browser protocol before returning the serialized DOM.
    const html = await page.evaluate((limit) => {
      const content = document.documentElement.outerHTML;
      return content.length <= limit ? content : null;
    }, MAX_HTML_BYTES);
    if (html === null || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      throw new BrowserUnavailableError("Rendered page is too large.");
    }
    return { url: parsePublicHttpUrl(page.url()).href, html };
  } catch (error) {
    if (error instanceof BrowserUnavailableError) throw error;
    throw new BrowserUnavailableError();
  } finally {
    clearTimeout(lifetime);
    try {
      if (browser) {
        const shutdown = setTimeout(() => browser?.process()?.kill("SIGKILL"), 2_000);
        await browser.close().catch(() => browser?.process()?.kill("SIGKILL"));
        clearTimeout(shutdown);
      }
    } finally {
      await proxy?.close();
      activeBrowsers--;
    }
  }
}
