/**
 * Local weekly recap script — run from project root:
 *   node scripts/local/weekly-recap.mjs
 *
 * Sends weekly recap email to each site owner showing their sites'
 * performance + sponsored ad slots.
 *
 * Pass --dry-run to preview without sending.
 */

import postgres from "postgres";
import { Resend } from "resend";
import { env } from "./env.mjs";

const sql = postgres(env.DATABASE_URL);
const resend = new Resend(env.RESEND_API_KEY);
const FROM_EMAIL = "TheFastestWeb <noreply@thefastestweb.site>";
const BASE_URL = env.NEXT_PUBLIC_SITE_URL || "https://thefastestweb.site";
const DRY_RUN = process.argv.includes("--dry-run");
const TEST_TO_IDX = process.argv.indexOf("--test-to");
const TEST_TO = TEST_TO_IDX !== -1 ? process.argv[TEST_TO_IDX + 1] : null;
const RESUME_AFTER_IDX = process.argv.indexOf("--resume-after");
const RESUME_AFTER = RESUME_AFTER_IDX !== -1 ? process.argv[RESUME_AFTER_IDX + 1] : null;

// ── Email colors ──────────────────────────────────────────────
const c = {
  bg: "#110F0D", cardBg: "#1A1816", border: "#2A2725",
  text: "#E8E2DA", textSec: "#9C9590", textMuted: "#6B6560",
  accent: "#F59E0B", accentBright: "#FBBF24", green: "#22C55E",
};

// ── Build weekly recap email HTML ─────────────────────────────
function buildRecapEmail(firstName, sites, sponsors) {
  const siteRows = sites.map((s) => {
    const diff = s.score - s.previousScore;
    const diffColor = diff > 0 ? c.green : diff < 0 ? "#EF4444" : c.textMuted;
    const diffText = diff > 0 ? `+${diff}` : `${diff}`;
    const scoreColor = s.score >= 90 ? c.green : s.score >= 50 ? c.accent : "#EF4444";
    return `<tr>
      <td style="padding:12px 0;border-bottom:1px solid ${c.border};"><a href="${BASE_URL}/site/${s.slug}" style="font-weight:600;font-size:14px;color:${c.text};text-decoration:none;">${s.name}</a></td>
      <td style="padding:12px 0;border-bottom:1px solid ${c.border};text-align:center;"><span style="font-weight:800;font-size:16px;color:${scoreColor};font-family:monospace;">${s.score}</span></td>
      <td style="padding:12px 0;border-bottom:1px solid ${c.border};text-align:center;"><span style="font-weight:600;font-size:13px;color:${diffColor};font-family:monospace;">${diffText}</span></td>
      <td style="padding:12px 0;border-bottom:1px solid ${c.border};text-align:right;"><span style="font-size:13px;color:${c.textSec};">#${s.rank}</span></td>
    </tr>`;
  }).join("");

  let sponsorHtml = "";
  if (sponsors.length > 0) {
    const items = sponsors.map((s) => {
      const domain = (() => { try { return new URL(s.url).hostname; } catch { return ""; } })();
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${c.border};">
          <a href="${s.url}" target="_blank" style="text-decoration:none;display:block;">
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr>
              <td style="width:28px;vertical-align:middle;padding-right:10px;">
                <img src="${favicon}" width="20" height="20" style="display:block;border-radius:4px;background:#fff;" />
              </td>
              <td style="vertical-align:middle;">
                <div style="font-weight:700;font-size:13px;color:${c.text};">${s.name}</div>
                <div style="font-size:12px;color:${c.textSec};margin-top:2px;">${s.tagline}</div>
              </td>
              <td style="width:28px;vertical-align:middle;text-align:right;">
                <span style="font-size:10px;color:${c.textMuted};">AD</span>
              </td>
            </tr></table>
          </a>
        </td>
      </tr>`;
    }).join("");
    sponsorHtml = `
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${c.border};">
        <div style="font-size:10px;color:${c.textMuted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Sponsored</div>
        <table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">${items}</table>
      </div>`;
  }

  const subject = sites.length === 1
    ? `Weekly recap: ${sites[0].name} scored ${sites[0].score}`
    : `Weekly recap: ${sites.length} sites tracked`;

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
    <h1 style="font-size:22px;font-weight:800;color:${c.text};margin:0 0 8px;text-align:center;">Your Weekly Recap</h1>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 28px;text-align:center;">Hey ${firstName}, here's how your sites performed this week.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead><tr>
        <th style="text-align:left;padding-bottom:8px;font-size:11px;color:${c.textMuted};text-transform:uppercase;border-bottom:1px solid ${c.border};">Site</th>
        <th style="text-align:center;padding-bottom:8px;font-size:11px;color:${c.textMuted};text-transform:uppercase;border-bottom:1px solid ${c.border};">Score</th>
        <th style="text-align:center;padding-bottom:8px;font-size:11px;color:${c.textMuted};text-transform:uppercase;border-bottom:1px solid ${c.border};">Change</th>
        <th style="text-align:right;padding-bottom:8px;font-size:11px;color:${c.textMuted};text-transform:uppercase;border-bottom:1px solid ${c.border};">Rank</th>
      </tr></thead>
      <tbody>${siteRows}</tbody>
    </table>
    <div style="text-align:center;"><a href="${BASE_URL}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${c.accent},${c.accentBright});color:${c.bg};font-weight:700;font-size:15px;text-decoration:none;">View Full Leaderboard</a></div>
    ${sponsorHtml}
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid ${c.border};text-align:center;">
      <p style="font-size:12px;color:${c.textMuted};margin:0;">We test your sites daily and send this recap every Monday.</p>
    </div>
  </div>
  <div style="text-align:center;"><p style="font-size:11px;color:${c.textMuted};margin:0;">You received this because you signed up at thefastestweb.site</p></div>
</div></body></html>`;

  return { subject, html };
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`=== TheFastestWeb Weekly Recap ${DRY_RUN ? "(DRY RUN)" : ""}${TEST_TO ? ` (TEST → ${TEST_TO})` : ""} ===\n`);

  // Get all listed sites ranked by score, skip sites created today or yesterday
  const rankedSites = await sql`
    SELECT s.id, s.name, s.slug, s.current_score as score, s.owner_id,
           ROW_NUMBER() OVER (ORDER BY s.current_score DESC) as rank
    FROM sites s
    WHERE s.is_listed = true
      AND s.owner_id IN (
        SELECT id FROM users
        WHERE created_at < NOW() - INTERVAL '2 days'
          AND is_pro = true
      )
    ORDER BY s.current_score DESC`;

  // Get previous scores (the score BEFORE the latest test)
  const previousScores = {};
  for (const site of rankedSites) {
    const tests = await sql`
      SELECT score FROM speed_tests
      WHERE site_id = ${site.id}
      ORDER BY tested_at DESC LIMIT 2`;
    previousScores[site.id] = tests.length > 1 ? tests[1].score : site.score;
  }

  // Group sites by owner
  const ownerSites = {};
  for (const site of rankedSites) {
    if (!site.owner_id) continue;
    if (!ownerSites[site.owner_id]) ownerSites[site.owner_id] = [];
    ownerSites[site.owner_id].push({
      name: site.name,
      slug: site.slug,
      score: site.score,
      previousScore: previousScores[site.id],
      rank: Number(site.rank),
    });
  }

  // Get active sponsors
  const sponsors = await sql`
    SELECT name, tagline, url FROM ad_slots
    WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())`;

  console.log(`Sites: ${rankedSites.length}, Owners: ${Object.keys(ownerSites).length}, Sponsors: ${sponsors.length}\n`);

  // Send to each owner
  let skipping = !!RESUME_AFTER;
  for (const [ownerId, sites] of Object.entries(ownerSites)) {
    const [owner] = await sql`SELECT name, email FROM users WHERE id = ${ownerId}`;
    if (!owner?.email) {
      console.log(`  Skipping owner ${ownerId}: no email`);
      continue;
    }

    if (skipping) {
      if (owner.email === RESUME_AFTER) skipping = false;
      console.log(`  Skipping ${owner.email}`);
      continue;
    }

    const firstName = owner.name?.split(" ")[0] || "there";
    const mail = buildRecapEmail(firstName, sites, sponsors);
    const sendTo = TEST_TO ?? owner.email;

    console.log(`  ${owner.name} (${owner.email}) — ${sites.length} sites`);
    sites.forEach((s) => console.log(`    ${s.name}: ${s.score} (was ${s.previousScore}) #${s.rank}`));

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would send: "${mail.subject}"\n`);
    } else {
      try {
        const { data, error } = await resend.emails.send({
          from: FROM_EMAIL, to: sendTo, subject: mail.subject, html: mail.html,
        });
        if (error) console.log(`    Email error: ${error.message}\n`);
        else console.log(`    Email sent: ${data?.id}\n`);
      } catch (e) {
        console.log(`    Email failed: ${e.message}\n`);
      }
      await new Promise((r) => setTimeout(r, 600));
    }

    // In test mode, only send one email then stop
    if (TEST_TO) {
      console.log(`\n[TEST MODE] Sent preview to ${TEST_TO}. Run without --test-to to send to all users.`);
      break;
    }
  }

  console.log("=== Done! ===");
  await sql.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
