/**
 * Local retest script — retests all listed sites and updates DB.
 *
 * Usage:
 *   node scripts/local/retest.mjs
 *
 * Does NOT send emails. Run trend-alert.mjs separately after this.
 */

import postgres from "postgres";
import { env } from "./env.mjs";

const PSI_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_KEY = env.GOOGLE_PSI_API_KEY;
const PSI_KEY_BACKUP = env.GOOGLE_PSI_API_KEY_BACKUP;

function newSql() {
  return postgres(env.DATABASE_URL, { connect_timeout: 15 });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function runSinglePSI(url, strategy = "mobile", apiKey = PSI_KEY) {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  if (apiKey) params.set("key", apiKey);

  const resp = await fetch(`${PSI_API}?${params}`);
  if (!resp.ok) {
    if (PSI_KEY_BACKUP && apiKey !== PSI_KEY_BACKUP && [429, 403, 500, 502, 503].includes(resp.status)) {
      console.log(`    Primary key failed (${resp.status}), trying backup...`);
      return runSinglePSI(url, strategy, PSI_KEY_BACKUP);
    }
    throw new Error(`PSI ${resp.status}`);
  }
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);

  const lh = data.lighthouseResult;
  const a = lh.audits;
  return {
    score: Math.round((lh.categories.performance.score || 0) * 100),
    fcpMs: Math.round(a["first-contentful-paint"]?.numericValue || 0),
    lcpMs: Math.round(a["largest-contentful-paint"]?.numericValue || 0),
    cls: a["cumulative-layout-shift"]?.numericValue ?? 0,
    tbtMs: Math.round(a["total-blocking-time"]?.numericValue || 0),
    ttiMs: Math.round(a["interactive"]?.numericValue || 0),
    siMs: Math.round(a["speed-index"]?.numericValue || 0),
  };
}

async function runStableTest(url) {
  const r1 = await runSinglePSI(url);
  console.log(`    Run 1: score=${r1.score}`);
  const r2 = await runSinglePSI(url);
  console.log(`    Run 2: score=${r2.score}`);

  return {
    score: Math.round((r1.score + r2.score) / 2),
    fcpMs: Math.round((r1.fcpMs + r2.fcpMs) / 2),
    lcpMs: Math.round((r1.lcpMs + r2.lcpMs) / 2),
    cls: (r1.cls + r2.cls) / 2,
    tbtMs: Math.round((r1.tbtMs + r2.tbtMs) / 2),
    ttiMs: Math.round((r1.ttiMs + r2.ttiMs) / 2),
    siMs: Math.round((r1.siMs + r2.siMs) / 2),
  };
}

async function recalcScore(siteId, sql) {
  const [latest] = await sql`
    SELECT score FROM speed_tests
    WHERE site_id = ${siteId}
    ORDER BY tested_at DESC LIMIT 1`;
  if (!latest) return null;
  await sql`UPDATE sites SET current_score = ${latest.score} WHERE id = ${siteId}`;
  return latest.score;
}

async function main() {
  console.log("=== TheFastestWeb Retest ===\n");

  const listSql = newSql();
  const allSites = await listSql`
    SELECT id, url, name, slug, current_score, owner_id
    FROM sites WHERE is_listed = true ORDER BY name`;
  await listSql.end();

  console.log(`Found ${allSites.length} sites to retest.\n`);

  let tested = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < allSites.length; i++) {
    const site = allSites[i];
    console.log(`[${i + 1}/${allSites.length}] ${site.name} (${site.url})`);

    const sql = newSql();
    try {
      // Skip sites that already have a test logged today
      const [todayTest] = await sql`
        SELECT id FROM speed_tests
        WHERE site_id = ${site.id} AND tested_at >= CURRENT_DATE
        LIMIT 1`;
      if (todayTest) {
        console.log("    Already tested today — skipped");
        skipped++;
        await sql.end();
        continue;
      }

      const data = await runStableTest(site.url);
      const loadTimeMs = data.lcpMs;

      await sql`INSERT INTO speed_tests (site_id, score, load_time_ms, fcp_ms, lcp_ms, cls, tbt_ms, tti_ms, si_ms, strategy)
        VALUES (${site.id}, ${data.score}, ${loadTimeMs}, ${data.fcpMs}, ${data.lcpMs}, ${data.cls}, ${data.tbtMs}, ${data.ttiMs}, ${data.siMs}, 'mobile')`;

      await sql`UPDATE sites SET
        current_fcp = ${formatMs(data.fcpMs)},
        current_lcp = ${formatMs(data.lcpMs)},
        current_cls = ${data.cls.toFixed(3)},
        current_tbt = ${formatMs(data.tbtMs)},
        current_tti = ${formatMs(data.ttiMs)},
        current_si = ${formatMs(data.siMs)},
        last_tested_at = NOW()
        WHERE id = ${site.id}`;

      const newScore = await recalcScore(site.id, sql) ?? data.score;
      const oldScore = site.current_score;
      const trend = oldScore > 0 ? Math.round(((newScore - oldScore) / oldScore) * 100) : 0;
      await sql`UPDATE sites SET trend = ${trend} WHERE id = ${site.id}`;

      const diff = newScore - oldScore;
      const arrow = diff > 0 ? "^" : diff < 0 ? "v" : "=";
      console.log(`    Avg score: ${data.score} | DB: ${oldScore} -> ${newScore} (${arrow}${Math.abs(diff)})`);

      tested++;
    } catch (err) {
      console.log(`    FAILED: ${err.message}`);
      failed++;
    } finally {
      await sql.end();
    }

    if (i < allSites.length - 1) {
      console.log("    Waiting 5s...\n");
      await delay(5000);
    }
  }

  console.log(`\n=== Done! Tested: ${tested}, Skipped: ${skipped}, Failed: ${failed} ===`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
