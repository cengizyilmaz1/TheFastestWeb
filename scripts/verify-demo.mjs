// Read-only checks for the explicitly configured, publicly reachable demo.
if (!process.env.DEMO_BASE_URL) throw new Error("Set DEMO_BASE_URL to the intended public demo origin.");
const origin = new URL(process.env.DEMO_BASE_URL);
if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("Supply a credential-free HTTPS demo origin.");
const checks = [];
async function check(path, status, validate = () => true) {
  const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15000) });
  const body = await response.text();
  const passed = response.status === status && validate(response, body);
  checks.push({ path, status: response.status, passed });
}
await check("/", 200, (response) => response.headers.get("x-robots-tag")?.includes("noindex")
  && response.headers.get("x-content-type-options") === "nosniff" && response.headers.get("strict-transport-security")?.startsWith("max-age="));
await check("/health/live", 200);
await check("/health/ready", 200, (response, body) => response.headers.get("cache-control")?.includes("no-store") && JSON.parse(body).status === "ready");
await check("/robots.txt", 200, (_, body) => /^Disallow: \/\s*$/m.test(body));
await check("/sitemap.xml", 200, (_, body) => body.includes("<sitemapindex") && !body.includes("<loc>"));
await check("/api/auth/providers", 200, (_, body) => Object.keys(JSON.parse(body)).length === 0);
await check("/api/founders/collaborations", 401);
await check("/admin", 404); // The admin panel remains inaccessible anonymously.
for (const path of ["/explore", "/leaderboard", "/founders", "/compare", "/methodology", "/dashboard", "/claim", "/unsubscribe"]) await check(path, 404);
for (const path of ["/about", "/test", "/pricing", "/leaderboard/90-plus", "/fastest/saas"]) await check(path, 200);
const insecure = new URL(origin); insecure.protocol = "http:";
const redirect = await fetch(insecure, { redirect: "manual", signal: AbortSignal.timeout(15000) });
checks.push({ path: "HTTP → HTTPS", status: redirect.status, passed: [301, 308].includes(redirect.status) && redirect.headers.get("location") === origin.href });
console.log(JSON.stringify({ origin: origin.origin, checks, failed: checks.filter((item) => !item.passed).length }, null, 2));
if (checks.some((item) => !item.passed)) process.exitCode = 1;
