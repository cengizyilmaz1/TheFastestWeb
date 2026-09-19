import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const CHROMIUM_VERSION = "149.0.0";
const CHROMIUM_PACK_URL = `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.tar`;
const LOCAL_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Fallback for client-rendered (SPA) sites where the badge is injected by
// JavaScript and never appears in the raw server HTML.
async function findInRenderedDom(url: string, needle: string): Promise<boolean> {
  const puppeteer = await import("puppeteer-core");
  const isLocal = !process.env.VERCEL;

  const executablePath = isLocal
    ? LOCAL_CHROME_PATH
    : await (async () => {
        const chromium = (await import("@sparticuz/chromium-min")).default;
        return chromium.executablePath(CHROMIUM_PACK_URL);
      })();

  const chromiumArgs = isLocal
    ? []
    : (await import("@sparticuz/chromium-min")).default.args;

  const browser = await puppeteer.default.launch({
    args: chromiumArgs,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; TheFastestWebBot/1.0; +https://thefastestweb.site)"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
    const html = await page.content();
    return html.includes(needle);
  } finally {
    await browser.close();
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const slug = request.nextUrl.searchParams.get("slug");

  if (!url || !slug) {
    return NextResponse.json({ error: "Missing url or slug" }, { status: 400 });
  }

  try {
    const needle = `thefastestweb.site/api/badge/${slug}`;

    const staticResp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TheFastestWebBot/1.0; +https://thefastestweb.site)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!staticResp.ok) {
      return NextResponse.json(
        { verified: false, reason: "Could not fetch your site" },
        { status: 200 }
      );
    }

    const staticHtml = await staticResp.text();
    if (staticHtml.includes(needle)) {
      return NextResponse.json({ verified: true });
    }

    // Badge wasn't in the raw HTML — the site may render it client-side.
    try {
      const verified = await findInRenderedDom(url, needle);
      return NextResponse.json({ verified });
    } catch (renderErr) {
      console.error("Headless badge check failed:", renderErr);
      return NextResponse.json({ verified: false });
    }
  } catch {
    return NextResponse.json(
      { verified: false, reason: "Could not reach your site" },
      { status: 200 }
    );
  }
}
