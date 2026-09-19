/**
 * Local trend alert script — analyzes recent speed trends and sends
 * email alerts to site owners when their sites have genuinely declined.
 *
 * Usage:
 *   node scripts/local/trend-alert.mjs           # send real emails
 *   node scripts/local/trend-alert.mjs --dry-run  # preview without sending
 *
 * Run AFTER retest.mjs so the latest scores are in the database.
 *
 * Algorithm (window comparison):
 *   1. For each listed site with an owner, get the last 6 speed tests
 *   2. Split into two windows: previous 3 (older) vs recent 3 (newer)
 *   3. Average each window
 *   4. If recent avg is >= 15 points lower than previous avg → alert
 *   This smooths out single-day noise and only fires on sustained drops.
 */

import postgres from "postgres";
import { Resend } from "resend";
import { env } from "./env.mjs";

const sql = postgres(env.DATABASE_URL);
const resend = new Resend(env.RESEND_API_KEY);
const FROM_EMAIL = "TheFastestWeb <noreply@thefastestweb.site>";
const BASE_URL = env.NEXT_PUBLIC_SITE_URL || "https://thefastestweb.site";
const DRY_RUN = process.argv.includes("--dry-run");
const WINDOW_SIZE = 3;    // number of tests per window
const MIN_DROP = 15;      // minimum avg drop between windows to trigger alert

// ── Email colors ──────────────────────────────────────────────
const c = {
  bg: "#110F0D", cardBg: "#1A1816", border: "#2A2725",
  text: "#E8E2DA", textSec: "#9C9590", textMuted: "#6B6560",
  accent: "#F59E0B", accentBright: "#FBBF24", green: "#22C55E",
};

function avg(arr) {
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

// ── Build trend alert email HTML ──────────────────────────────
function buildTrendAlertEmail(firstName, siteName, siteSlug, allDays, drop, metrics) {
  const endScore = allDays[allDays.length - 1].score;
  const totalDays = allDays.length;
  const scoreColor = endScore >= 90 ? c.green : endScore >= 50 ? c.accent : "#EF4444";

  const trendRows = allDays.map((day, i) => {
    const prev = i > 0 ? allDays[i - 1].score : null;
    const diff = prev !== null ? day.score - prev : 0;
    const diffColor = diff > 0 ? c.green : diff < 0 ? "#EF4444" : c.textMuted;
    const diffText = prev !== null ? (diff > 0 ? `+${diff}` : `${diff}`) : "-";
    const dayScoreColor = day.score >= 90 ? c.green : day.score >= 50 ? c.accent : "#EF4444";
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${c.border};font-size:13px;color:${c.textSec};">${day.date}</td>
      <td style="padding:8px 0;border-bottom:1px solid ${c.border};text-align:center;font-weight:800;font-size:15px;color:${dayScoreColor};font-family:monospace;">${day.score}</td>
      <td style="padding:8px 0;border-bottom:1px solid ${c.border};text-align:right;font-weight:600;font-size:13px;color:${diffColor};font-family:monospace;">${diffText}</td>
    </tr>`;
  }).join("");

  const metricsHtml = metrics ? `
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
      <tr>
        ${["FCP", "LCP", "CLS"].map(m => `<td style="padding:4px;width:33.3%;"><div style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:${c.textMuted};text-transform:uppercase;margin-bottom:4px;">${m}</div>
          <div style="font-size:14px;font-weight:700;color:${c.text};font-family:monospace;">${metrics[m.toLowerCase()] || "N/A"}</div>
        </div></td>`).join("")}
      </tr>
      <tr>
        ${["TBT", "SI"].map(m => `<td style="padding:4px;width:33.3%;"><div style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:${c.textMuted};text-transform:uppercase;margin-bottom:4px;">${m}</div>
          <div style="font-size:14px;font-weight:700;color:${c.text};font-family:monospace;">${metrics[m.toLowerCase()] || "N/A"}</div>
        </div></td>`).join("")}
        <td style="padding:4px;width:33.3%;"></td>
      </tr>
    </table>` : "";

  const subject = `Speed alert: ${siteName} avg dropped ${drop} points`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background-color:${c.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${BASE_URL}" style="text-decoration:none;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>
        <td style="vertical-align:middle;padding-right:10px;"><img src="${BASE_URL}/logo.png" width="40" height="28" style="display:block;" /></td>
        <td style="vertical-align:middle;"><span style="font-weight:800;font-size:18px;color:${c.text};">TheFastestWeb</span></td>
      </tr></table>
    </a>
  </div>
  <div style="background-color:${c.cardBg};border:1px solid ${c.border};border-radius:14px;padding:32px;margin-bottom:24px;">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-block;padding:4px 14px;border-radius:20px;background-color:rgba(239,68,68,0.15);color:#EF4444;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Speed Trend Alert</div>
    </div>
    <h1 style="font-size:22px;font-weight:800;color:${c.text};margin:0 0 8px;text-align:center;">${siteName} performance dropped</h1>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 24px;text-align:center;line-height:1.5;">
      Hey ${firstName}, ${siteName}'s average score has dropped ${drop} points compared to the previous period. Here's the last ${totalDays} days:
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead><tr>
        <th style="text-align:left;padding-bottom:8px;font-size:10px;color:${c.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${c.border};">Day</th>
        <th style="text-align:center;padding-bottom:8px;font-size:10px;color:${c.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${c.border};">Score</th>
        <th style="text-align:right;padding-bottom:8px;font-size:10px;color:${c.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${c.border};">Change</th>
      </tr></thead>
      <tbody>${trendRows}</tbody>
    </table>
    <div style="background-color:${c.bg};border:1px solid ${c.border};border-radius:10px;padding:16px;text-align:center;margin-bottom:24px;">
      <div style="font-size:11px;color:${c.textMuted};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Current Score</div>
      <div style="font-size:36px;font-weight:800;color:${scoreColor};">${endScore}</div>
      <div style="font-size:12px;color:#EF4444;margin-top:4px;">avg down ${drop} pts from previous period</div>
    </div>
    ${metricsHtml}
    <div style="background-color:${c.bg};border:1px solid ${c.border};border-radius:10px;padding:16px;margin-bottom:24px;">
      <div style="font-weight:700;font-size:13px;color:${c.text};margin-bottom:8px;">What to check</div>
      <div style="font-size:12px;color:${c.textSec};line-height:1.6;">
        &bull; Recent deployments that added new scripts or assets<br />
        &bull; Third-party services or ads impacting load time<br />
        &bull; Server or hosting performance degradation<br />
        &bull; Large images or media added without optimization
      </div>
    </div>
    <div style="text-align:center;">
      <a href="${BASE_URL}/site/${siteSlug}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${c.accent},${c.accentBright});color:${c.bg};font-weight:700;font-size:15px;text-decoration:none;">View Full Report</a>
    </div>
  </div>
  <div style="text-align:center;"><p style="font-size:11px;color:${c.textMuted};margin:0;">You received this because you signed up at thefastestweb.site</p></div>
</div></body></html>`;

  return { subject, html };
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`=== TheFastestWeb Trend Alert ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
  console.log(`Algorithm: compare avg of last ${WINDOW_SIZE} tests vs previous ${WINDOW_SIZE} tests`);
  console.log(`Threshold: alert if recent avg is >= ${MIN_DROP} points lower\n`);

  const allSites = await sql`
    SELECT s.id, s.name, s.slug, s.owner_id,
           s.current_fcp, s.current_lcp, s.current_cls, s.current_tbt, s.current_si
    FROM sites s WHERE s.is_listed = true AND s.owner_id IS NOT NULL
    ORDER BY s.name`;

  console.log(`Checking ${allSites.length} sites...\n`);

  let alerts = 0;
  let skipped = 0;

  for (const site of allSites) {
    const totalNeeded = WINDOW_SIZE * 2;
    const recentTests = await sql`
      SELECT score, tested_at FROM speed_tests
      WHERE site_id = ${site.id}
      ORDER BY tested_at DESC LIMIT ${totalNeeded}`;

    if (recentTests.length < totalNeeded) {
      console.log(`  ${site.name}: only ${recentTests.length} tests, need ${totalNeeded} — skipped`);
      skipped++;
      continue;
    }

    // Oldest first
    const allTests = recentTests.reverse();
    const prevWindow = allTests.slice(0, WINDOW_SIZE).map(t => t.score);
    const recentWindow = allTests.slice(WINDOW_SIZE).map(t => t.score);

    const prevAvg = avg(prevWindow);
    const recentAvg = avg(recentWindow);
    const drop = prevAvg - recentAvg;

    console.log(`  ${site.name}: prev [${prevWindow.join(", ")}] avg=${prevAvg} | recent [${recentWindow.join(", ")}] avg=${recentAvg} | drop=${drop}`);

    if (drop < MIN_DROP) {
      console.log(`    Below ${MIN_DROP} threshold — no alert`);
      continue;
    }

    // This site qualifies for an alert
    const [owner] = await sql`SELECT name, email FROM users WHERE id = ${site.owner_id}`;
    if (!owner?.email) {
      console.log(`    Owner has no email — skipped`);
      skipped++;
      continue;
    }

    const firstName = owner.name?.split(" ")[0] || "there";
    const allDays = allTests.map((s) => ({
      date: s.tested_at ? new Date(s.tested_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A",
      score: s.score,
    }));

    const metrics = {
      fcp: site.current_fcp || undefined,
      lcp: site.current_lcp || undefined,
      cls: site.current_cls || undefined,
      tbt: site.current_tbt || undefined,
      si: site.current_si || undefined,
    };

    const mail = buildTrendAlertEmail(firstName, site.name, site.slug, allDays, drop, metrics);

    console.log(`    ALERT — To: ${owner.email}`);

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would send: "${mail.subject}"\n`);
    } else {
      try {
        const { data, error } = await resend.emails.send({
          from: FROM_EMAIL, to: owner.email, subject: mail.subject, html: mail.html,
        });
        if (error) console.log(`    Email error: ${error.message}\n`);
        else console.log(`    Email sent: ${data?.id}\n`);
      } catch (e) {
        console.log(`    Email failed: ${e.message}\n`);
      }
    }

    alerts++;
  }

  console.log(`\n=== Done! Alerts: ${alerts}, Skipped: ${skipped} ===`);
  await sql.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
