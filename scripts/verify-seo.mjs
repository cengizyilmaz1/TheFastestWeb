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
  : { robots: robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`), sitemap: sitemap.includes("/sitemaps/pages/0.xml") && !/\/sitemaps\/(technologies|countries|weekly|monthly)\//.test(sitemap) });
const indexedUrls = new Set();
for (const match of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) {
  const child = new URL(match[1]);
  if (child.origin !== canonicalOrigin || !/^\/sitemaps\/(pages|sites|blog|categories|founders)\/(0|[1-9]\d*)\.xml$/.test(child.pathname)) {
    record("sitemap-child", { canonicalChild: false }); continue;
  }
  const response = await fetch(new URL(child.pathname, base), { signal: AbortSignal.timeout(45_000) });
  const xml = await response.text(), entries = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((entry) => entry[1]);
  const unique = entries.every((entry) => !indexedUrls.has(entry)) && new Set(entries).size === entries.length;
  entries.forEach((entry) => indexedUrls.add(entry));
  record(child.pathname, { status: response.status === 200, xml: xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
    bounded: entries.length > 0 && entries.length <= 200, unique,
    canonicalPublic: entries.every((entry) => new URL(entry).origin === canonicalOrigin && !/^\/(profile|api|auth|admin)(\/|$)/.test(new URL(entry).pathname)),
  });
}
for (const path of ["/llms.txt", "/llms-full.txt", "/llms/catalog.md"]) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(45_000) });
  const body = await response.text();
  record(path, { status: response.status === 200, markdown: response.headers.get("content-type")?.startsWith("text/markdown"),
    canonicalLinks: body.includes(canonicalOrigin), noindex: response.headers.get("x-robots-tag")?.includes("noindex"),
    completeManifest: path === "/llms.txt" ? body.includes("/llms/catalog.md") : body.includes("Complete corpus manifest"),
  });
  if (path !== "/llms/catalog.md") continue;
  const parts = [...body.matchAll(/\]\((https?:\/\/[^\s)]+\/llms\/(sites|articles|founders)\/(?:0|[1-9]\d*)\.md)\)/g)];
  for (const [, absolute, section] of parts) {
    const part = new URL(absolute);
    if (part.origin !== canonicalOrigin) { record("corpus-part", { canonical: false }); continue; }
    const result = await fetch(new URL(part.pathname, base), { signal: AbortSignal.timeout(45_000) });
    const text = await result.text();
    const count = section === "sites" ? (text.match(/Canonical report:/g) || []).length
      : section === "founders" ? (text.match(/Canonical profile:/g) || []).length : (text.match(/Canonical source: https?:\/\/[^\s]+\/blog\//g) || []).length;
    record(part.pathname, { status: result.status === 200, bounded: count > 0 && count <= 200,
      uncached: result.headers.get("cache-control") === "no-store", indexLink: text.includes("/llms/catalog.md") });
  }
}
await mkdir("test-results", { recursive: true });
await writeFile("test-results/seo-smoke.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checks: report.length, failures: report.filter((entry) => !entry.passed), report: "test-results/seo-smoke.json" }));
if (report.some((entry) => !entry.passed)) process.exitCode = 1;
