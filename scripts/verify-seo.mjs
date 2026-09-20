import { parse } from "parse5";
import { mkdir, writeFile } from "node:fs/promises";

const base = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3100");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("SEO checks are restricted to an explicitly configured loopback runtime.");
const report = [];
function nodes(root) {
  const result = [], pending = [root];
  while (pending.length) { const node = pending.shift(); result.push(node); pending.push(...(node.childNodes || [])); }
  return result;
}
function attr(node, name) { return node.attrs?.find((item) => item.name === name)?.value; }
function content(node) { return (node.childNodes || []).map((child) => child.value || content(child)).join(""); }
function sameUrl(actual, expected) {
  try { return new URL(actual).href === new URL(expected).href; } catch { return false; }
}
async function document(path) {
  const response = await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(45_000) });
  const html = await response.text(), all = nodes(parse(html));
  const meta = (name) => all.find((node) => node.tagName === "meta" && (attr(node, "name") === name || attr(node, "property") === name));
  const canonicals = all.filter((node) => node.tagName === "link" && attr(node, "rel") === "canonical").map((node) => attr(node, "href"));
  const scripts = all.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json");
  const structured = scripts.map((node) => JSON.parse(content(node)));
  return { response, all, meta: (name) => attr(meta(name) || {}, "content"), canonicals, structured,
    title: content(all.find((node) => node.tagName === "title") || {}),
    links: all.filter((node) => node.tagName === "a").map((node) => attr(node, "href")).filter(Boolean) };
}
function record(path, checks) {
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  report.push({ path, passed: failed.length === 0, failed });
}
const home = await document("/");
if (!home.canonicals[0]) throw new Error("Home canonical is missing.");
const canonicalOrigin = new URL(process.env.SITE_URL || home.canonicals[0]).origin;
const demo = home.response.headers.get("x-robots-tag")?.includes("noindex") || home.meta("robots")?.includes("noindex");
const blog = await document("/blog");
const site = home.links.find((link) => link.startsWith("/site/"));
const article = blog.links.find((link) => link.startsWith("/blog/"));
const routes = ["/", "/test", "/submit", "/pricing", "/about", "/blog", "/privacy", "/terms", "/categories", "/fastest/ai", "/fastest/developer-tools", "/fastest/saas", "/leaderboard/90-plus", ...(site ? [site] : []), ...(article ? [article] : [])];
for (const path of routes) {
  const page = path === "/" ? home : path === "/blog" ? blog : await document(path);
  const canonical = new URL(path, canonicalOrigin).href;
  const identities = page.structured.flatMap((entry) => entry["@graph"] || [entry]);
  record(path, { status: page.response.status === 200, oneCanonical: page.canonicals.length === 1 && sameUrl(page.canonicals[0], canonical),
    title: Boolean(page.title) && !/TheFastestWeb.*\| TheFastestWeb/.test(page.title), description: Boolean(page.meta("description")),
    openGraph: sameUrl(page.meta("og:url"), canonical) && Boolean(page.meta("og:title")) && Boolean(page.meta("og:image")),
    twitter: page.meta("twitter:card") === "summary_large_image" && Boolean(page.meta("twitter:image")),
    identity: identities.some((entry) => entry["@type"] === "Person" && entry.name === "Cengiz YILMAZ" && entry.url === "https://cengizyilmaz.net"),
    demoIndexing: !demo || page.meta("robots")?.includes("noindex"),
    noImaginarySearch: !JSON.stringify(page.structured).includes("SearchAction"),
  });
}
const pageTwo = blog.links.find((link) => /\/blog\?page=2(?:$|&)/.test(link));
if (pageTwo) {
  const page = await document(pageTwo);
  record("/blog?page=2", { status: page.response.status === 200, ownCanonical: page.canonicals.length === 1 && page.canonicals[0] === new URL("/blog?page=2", canonicalOrigin).href });
}
for (const path of ["/auth/login", "/badge-preview", "/links"]) {
  const page = await document(path);
  record(path, { status: page.response.status === 200, privateIndexing: page.meta("robots")?.includes("noindex") });
}
const preferences = await document("/privacy?unsubscribe=synthetic-seo-probe");
record("/privacy (preferences)", { status: preferences.response.status === 200, tokenFreeCanonical: preferences.canonicals[0] === new URL("/privacy", canonicalOrigin).href,
  noindex: preferences.meta("robots")?.includes("noindex"), referrer: preferences.meta("referrer") === "no-referrer" });
const robots = await fetch(new URL("/robots.txt", base)).then((response) => response.text());
const sitemap = await fetch(new URL("/sitemap.xml", base)).then((response) => response.text());
record("indexing-controls", demo ? { robots: /^Disallow: \/\s*$/m.test(robots), sitemap: sitemap.includes("<sitemapindex") && !sitemap.includes("<loc>") }
  : { robots: robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`), sitemap: sitemap.includes("/sitemaps/pages/0.xml") && !/\/sitemaps\/(founders|technologies|countries|weekly|monthly)\//.test(sitemap) });
await mkdir("test-results", { recursive: true });
await writeFile("test-results/seo-smoke.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checks: report.length, failures: report.filter((entry) => !entry.passed), report: "test-results/seo-smoke.json" }));
if (report.some((entry) => !entry.passed)) process.exitCode = 1;
