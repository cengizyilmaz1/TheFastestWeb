import postgres from "postgres";
import { env } from "./env.mjs";

const [,, siteId] = process.argv;
if (!siteId) { console.error("Usage: node scripts/local/retest-one.mjs <siteId>"); process.exit(1); }

const sql = postgres(env.DATABASE_URL);
const apiKey = env.GOOGLE_PSI_API_KEY;

const [site] = await sql`SELECT id, name, url FROM sites WHERE id = ${siteId}`;
if (!site) { console.error("Site not found"); process.exit(1); }

console.log(`Retesting: ${site.name} (${site.url})`);

async function psi() {
  const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(site.url)}&strategy=mobile&key=${apiKey}`);
  if (!r.ok) { console.log("PSI error:", r.status); return null; }
  const d = await r.json();
  return Math.round((d.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
}

const s1 = await psi();
console.log("Run 1:", s1);
await new Promise(r => setTimeout(r, 5000));
const s2 = await psi();
console.log("Run 2:", s2);

if (!s1 || !s2) { console.log("Failed"); sql.end(); process.exit(1); }

const avg = Math.round((s1 + s2) / 2);
await sql`INSERT INTO speed_tests (site_id, score, load_time_ms, fcp_ms, lcp_ms, cls, tbt_ms, tti_ms, si_ms, strategy)
  VALUES (${siteId}, ${avg}, 0, 0, 0, 0, 0, 0, 0, 'mobile')`;
await sql`UPDATE sites SET current_score = ${avg}, last_tested_at = NOW() WHERE id = ${siteId}`;
console.log(`Done — ${site.name} updated to ${avg}/100`);
sql.end();
