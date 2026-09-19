/**
 * Inactivity enforcement script — run manually or wire into a cron.
 *
 * Usage:
 *   node scripts/local/inactivity.mjs           # run for real
 *   node scripts/local/inactivity.mjs --dry-run  # preview without any DB writes or emails
 *
 * What it does (two passes):
 *
 *   Pass 1 — 10-day pause:
 *     Find free users whose lastActiveAt is older than 10 days (or null)
 *     AND who have at least one site that is listed AND not yet monitoring_paused.
 *     → Sets monitoring_paused = true on those sites.
 *     → Sends monitoringPauseEmail to the user.
 *
 *   Pass 2 — 30-day removal:
 *     Find free users whose lastActiveAt is older than 30 days (or null)
 *     AND who have at least one site that is still listed.
 *     → Sets is_listed = false on those sites.
 *     → Sends listingRemovalEmail to the user.
 *
 * Notes:
 *   - Pro users are completely skipped (always-on monitoring is a Pro perk).
 *   - A user can appear in both passes on the same run (rare, but possible if
 *     they were somehow missed by earlier runs). The 30-day pass acts independently.
 *   - 600ms delay between emails to stay under Resend's 2 req/sec limit.
 */

import postgres from "postgres";
import { Resend } from "resend";
import { env } from "./env.mjs";

const sql = postgres(env.DATABASE_URL);
const resend = new Resend(env.RESEND_API_KEY);
const FROM_EMAIL = "TheFastestWeb <noreply@thefastestweb.site>";
const BASE_URL = env.NEXT_PUBLIC_SITE_URL || "https://thefastestweb.site";
const DRY_RUN = process.argv.includes("--dry-run");

const PAUSE_DAYS = 10;
const REMOVAL_DAYS = 30;
const EMAIL_DELAY_MS = 600;

// Grandfathered users: submitted before activity tracking existed, so
// last_active_at has always been null and they'd otherwise be permanently
// exempt from the pause/removal passes above. Give them one warning email,
// then run them through the same pause/removal shape on their own clock.
const GRANDFATHER_GRACE_DAYS = 7;
const GRANDFATHER_PAUSE_DAYS = GRANDFATHER_GRACE_DAYS;
const GRANDFATHER_REMOVAL_DAYS = GRANDFATHER_GRACE_DAYS + (REMOVAL_DAYS - PAUSE_DAYS);

// Resend free plan caps at 100 emails/day — stop well before that so a
// bulk pass never gets throttled mid-run or crowds out other transactional
// email (badge warnings, weekly recap, etc.) sent the same day.
const DAILY_QUOTA_SAFETY_CEILING = 90;

// ── Email helpers (plain JS port of the TS templates) ─────────────────────────

const c = {
  bg: "#110F0D", cardBg: "#1A1816", border: "#2A2725",
  text: "#E8E2DA", textSec: "#9C9590", textMuted: "#6B6560",
  accent: "#F59E0B", accentBright: "#FBBF24", green: "#22C55E",
};

function emailWrapper(content) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:${c.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${BASE_URL}" style="text-decoration:none;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>
          <td style="vertical-align:middle;padding-right:10px;"><img src="${BASE_URL}/logo.png" alt="TheFastestWeb" width="40" height="28" style="display:block;" /></td>
          <td style="vertical-align:middle;"><span style="font-weight:800;font-size:18px;color:${c.text};letter-spacing:-0.02em;">TheFastestWeb</span></td>
        </tr></table>
      </a>
    </div>
    <div style="background-color:${c.cardBg};border:1px solid ${c.border};border-radius:14px;padding:32px;margin-bottom:24px;">
      ${content}
    </div>
    <div style="text-align:center;padding-top:8px;">
      <p style="font-size:12px;color:${c.textMuted};margin:0 0 4px;">
        <a href="${BASE_URL}" style="color:${c.textMuted};text-decoration:none;">TheFastestWeb</a>
        &nbsp;&middot;&nbsp;Speed Rankings for the Web
      </p>
      <p style="font-size:11px;color:${c.textMuted};margin:0;">
        You received this because you signed up at thefastestweb.site
      </p>
    </div>
  </div>
</body>
</html>`;
}

function scoreColor(score) {
  return score >= 90 ? c.green : score >= 50 ? c.accent : "#EF4444";
}

function buildMonitoringPauseEmail(name, sites) {
  const firstName = name.split(" ")[0];
  const siteRows = sites.map(s => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid ${c.border};">
        <a href="${BASE_URL}/site/${s.slug}" style="font-weight:600;font-size:14px;color:${c.text};text-decoration:none;">${s.name}</a>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid ${c.border};text-align:right;">
        <span style="font-family:monospace;font-weight:700;font-size:14px;color:${scoreColor(s.score)};">${s.score}/100</span>
      </td>
    </tr>`).join("");

  const content = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background-color:#1A1816;border:1px solid #2A2725;line-height:48px;font-size:22px;">⏸</div>
    </div>
    <h1 style="font-size:20px;font-weight:800;color:${c.text};margin:0 0 8px;text-align:center;">Speed monitoring paused</h1>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 24px;text-align:center;line-height:1.5;">
      Hey ${firstName}, we haven't seen you in ${PAUSE_DAYS} days so we've paused daily retesting for your ${sites.length === 1 ? "site" : "sites"}. Your listing is still live.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">${siteRows}</table>
    <p style="font-size:13px;color:${c.textSec};margin:0 0 20px;line-height:1.5;text-align:center;">
      Log in to reactivate monitoring instantly. If you don't log in within the next ${REMOVAL_DAYS - PAUSE_DAYS} days, your listing will be removed.
    </p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${BASE_URL}/submit" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${c.accent},${c.accentBright});color:${c.bg};font-weight:700;font-size:15px;text-decoration:none;">
        Log In to Reactivate
      </a>
    </div>
    <div style="padding:16px;border-radius:10px;background-color:${c.bg};border:1px solid ${c.border};text-align:center;">
      <p style="font-size:12px;color:${c.textMuted};margin:0;line-height:1.5;">
        Want monitoring without worrying about this?
        <a href="${BASE_URL}/pricing" style="color:${c.accent};text-decoration:none;">Upgrade to Pro</a>
        for always-on monitoring, dofollow backlinks, and weekly recap emails.
      </p>
    </div>`;

  return {
    subject: `Speed monitoring paused for ${sites.length === 1 ? sites[0].name : `your ${sites.length} sites`}`,
    html: emailWrapper(content),
  };
}

function buildListingRemovalEmail(name, sites) {
  const firstName = name.split(" ")[0];
  const siteRows = sites.map(s => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid ${c.border};">
        <span style="font-weight:600;font-size:14px;color:${c.textMuted};">${s.name}</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid ${c.border};text-align:right;">
        <span style="font-family:monospace;font-weight:700;font-size:14px;color:${c.textMuted};">was ${s.score}/100</span>
      </td>
    </tr>`).join("");

  const content = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background-color:#1A1816;border:1px solid #2A2725;line-height:48px;font-size:22px;">🗑</div>
    </div>
    <h1 style="font-size:20px;font-weight:800;color:${c.text};margin:0 0 8px;text-align:center;">Your listing has been removed</h1>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 24px;text-align:center;line-height:1.5;">
      Hey ${firstName}, your ${sites.length === 1 ? "site has" : "sites have"} been removed from the leaderboard after ${REMOVAL_DAYS} days without a login.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">${siteRows}</table>
    <p style="font-size:13px;color:${c.textSec};margin:0 0 20px;line-height:1.5;text-align:center;">
      No worries — you can resubmit any time and get back on the leaderboard.
    </p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${BASE_URL}/submit" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${c.accent},${c.accentBright});color:${c.bg};font-weight:700;font-size:15px;text-decoration:none;">
        Resubmit Your Site
      </a>
    </div>
    <div style="padding:16px;border-radius:10px;background-color:${c.bg};border:1px solid ${c.border};text-align:center;">
      <p style="font-size:12px;color:${c.textMuted};margin:0;line-height:1.5;">
        Upgrade to <a href="${BASE_URL}/pricing" style="color:${c.accent};text-decoration:none;">Pro</a>
        and never worry about inactivity again — always-on monitoring, dofollow backlinks, and unlimited sites.
      </p>
    </div>`;

  return {
    subject: `Your ${sites.length === 1 ? "listing has" : "listings have"} been removed from TheFastestWeb`,
    html: emailWrapper(content),
  };
}

function buildGrandfatherWarningEmail(name, sites, joinedAt) {
  const firstName = name.split(" ")[0];
  const site = sites[0];
  const joinedDate = joinedAt.toISOString().split("T")[0];

  const content = `
    <p style="font-size:14px;color:${c.textSec};margin:0 0 16px;line-height:1.6;">
      Hey ${firstName},
    </p>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 16px;line-height:1.6;">
      Quick personal note from me, Ramesh.
    </p>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 16px;line-height:1.6;">
      I'm building TheFastestWeb to help indie sites keep an eye on their real-world speed, not just get a one-time backlink. You submitted <strong style="color:${c.text};">${site.name}</strong> on ${joinedDate}, but I haven't seen you back on the site since, so I'm assuming you moved on.
    </p>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 16px;line-height:1.6;">
      That's fine! But we're now enforcing an activity policy for free listings: if you don't visit within <strong style="color:${c.text};">${GRANDFATHER_GRACE_DAYS} days</strong>, monitoring will pause, and the listing will be removed shortly after if it stays quiet.
    </p>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 24px;line-height:1.6;">
      If you still want ${site.name} on the leaderboard, log in within the next ${GRANDFATHER_GRACE_DAYS} days to mark yourself active again, then just keep checking in every so often (at least once every ${PAUSE_DAYS} days) so monitoring doesn't pause on you.
    </p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${BASE_URL}/site/${site.slug}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${c.accent},${c.accentBright});color:${c.bg};font-weight:700;font-size:15px;text-decoration:none;">
        Visit Your Site Page
      </a>
    </div>
    <div style="padding:16px;border-radius:10px;background-color:${c.bg};border:1px solid ${c.border};text-align:center;">
      <p style="font-size:12px;color:${c.textMuted};margin:0;line-height:1.5;">
        Want to skip this entirely? <a href="${BASE_URL}/pricing" style="color:${c.accent};text-decoration:none;">Upgrade to Pro</a>
        for always-on monitoring with no activity requirement.
      </p>
    </div>
    <p style="font-size:13px;color:${c.textMuted};margin:20px 0 0;text-align:center;">
      Thanks,<br />Ramesh
    </p>`;

  return {
    subject: `Quick note about ${site.name} on TheFastestWeb`,
    html: emailWrapper(content),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// ── Pass 0: Grandfather warning (never-active users predating tracking) ────

async function runGrandfatherWarningPass() {
  console.log(`\n── Pass 0: Grandfather warning (never active, no warning sent yet) ──`);

  const rows = await sql`
    SELECT DISTINCT
      u.id AS user_id, u.email, u.name, u.created_at,
      s.id AS site_id, s.name AS site_name, s.slug
    FROM users u
    JOIN sites s ON s.owner_id = u.id
    WHERE u.is_pro = false
      AND s.is_listed = true
      AND u.last_active_at IS NULL
      AND u.grandfather_warning_sent_at IS NULL
    ORDER BY u.email
  `;

  if (rows.length === 0) {
    console.log("  No never-active users to warn.");
    return;
  }

  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        createdAt: row.created_at,
        sites: [],
      });
    }
    byUser.get(row.user_id).sites.push({ id: row.site_id, name: row.site_name, slug: row.slug });
  }

  console.log(`  Found ${byUser.size} never-active user(s) to warn:`);

  let quotaHalted = false;

  for (const user of byUser.values()) {
    if (quotaHalted) {
      console.log(`\n  ${user.name} <${user.email}> — skipped (daily quota safety ceiling reached, resume tomorrow)`);
      continue;
    }

    console.log(`\n  ${user.name} <${user.email}> (joined ${user.createdAt.toISOString().split("T")[0]}, ${user.sites.map(s => s.name).join(", ")})`);

    if (!DRY_RUN) {
      const mail = buildGrandfatherWarningEmail(user.name, user.sites, user.createdAt);
      try {
        const result = await resend.emails.send({
          from: FROM_EMAIL,
          to: user.email,
          subject: mail.subject,
          html: mail.html,
        });
        await sql`UPDATE users SET grandfather_warning_sent_at = now() WHERE id = ${user.userId}`;
        const dailyUsed = Number(result?.headers?.["x-resend-daily-quota"]);
        console.log(`    ✓ Warned${Number.isFinite(dailyUsed) ? ` (daily quota: ${dailyUsed}/100)` : ""}`);
        if (Number.isFinite(dailyUsed) && dailyUsed >= DAILY_QUOTA_SAFETY_CEILING) {
          console.log(`    ⚠ Hit safety ceiling of ${DAILY_QUOTA_SAFETY_CEILING}/100 — halting remaining sends for today.`);
          quotaHalted = true;
        }
      } catch (err) {
        console.error(`    ✗ Email failed: ${err.message}`);
      }

      await sleep(EMAIL_DELAY_MS);
    } else {
      console.log(`    [dry-run] Would send grandfather warning email`);
    }
  }
}

// ── Pass 1: Pause monitoring (10 days inactive) ────────────────────────────

async function runPausePass() {
  console.log(`\n── Pass 1: Pause monitoring (inactive > ${PAUSE_DAYS} days, or grandfathered > ${GRANDFATHER_PAUSE_DAYS} days) ──`);

  // Free users inactive > 10 days who have listed, non-paused sites —
  // plus grandfathered never-active users past their own grace period.
  const rows = await sql`
    SELECT
      u.id        AS user_id,
      u.email,
      u.name,
      u.last_active_at,
      u.created_at,
      s.id        AS site_id,
      s.name      AS site_name,
      s.slug,
      s.current_score AS score
    FROM users u
    JOIN sites s ON s.owner_id = u.id
    WHERE u.is_pro = false
      AND s.is_listed = true
      AND s.monitoring_paused = false
      AND (
        (u.last_active_at IS NOT NULL AND u.last_active_at < ${daysAgo(PAUSE_DAYS)})
        OR
        (u.last_active_at IS NULL AND u.grandfather_warning_sent_at IS NOT NULL AND u.grandfather_warning_sent_at < ${daysAgo(GRANDFATHER_PAUSE_DAYS)})
      )
    ORDER BY u.email, s.name
  `;

  if (rows.length === 0) {
    console.log("  No users to pause.");
    return;
  }

  // Group by user
  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        lastActiveAt: row.last_active_at,
        createdAt: row.created_at,
        sites: [],
      });
    }
    byUser.get(row.user_id).sites.push({
      id: row.site_id,
      name: row.site_name,
      slug: row.slug,
      score: row.score,
    });
  }

  console.log(`  Found ${byUser.size} user(s) to pause:`);

  for (const user of byUser.values()) {
    const lastSeen = user.lastActiveAt
      ? `last seen ${user.lastActiveAt.toISOString().split("T")[0]}`
      : `never logged in, joined ${user.createdAt.toISOString().split("T")[0]}`;
    console.log(`\n  ${user.name} <${user.email}> (${lastSeen})`);
    for (const s of user.sites) {
      console.log(`    - ${s.name} (${s.slug}) — ${s.score}/100`);
    }

    if (!DRY_RUN) {
      // Pause all qualifying sites for this user
      const siteIds = user.sites.map((s) => s.id);
      await sql`
        UPDATE sites
        SET monitoring_paused = true
        WHERE id = ANY(${sql.array(siteIds)}::uuid[])
      `;

      // Send email
      const mail = buildMonitoringPauseEmail(user.name, user.sites);
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: user.email,
          subject: mail.subject,
          html: mail.html,
        });
        console.log(`    ✓ Paused + emailed`);
      } catch (err) {
        console.error(`    ✗ Email failed: ${err.message}`);
      }

      await sleep(EMAIL_DELAY_MS);
    } else {
      console.log(`    [dry-run] Would pause monitoring and send email`);
    }
  }
}

// ── Pass 2: Remove listings (30 days inactive) ────────────────────────────

async function runRemovalPass() {
  console.log(`\n── Pass 2: Remove listings (inactive > ${REMOVAL_DAYS} days, or grandfathered > ${GRANDFATHER_REMOVAL_DAYS} days) ──`);

  const rows = await sql`
    SELECT
      u.id        AS user_id,
      u.email,
      u.name,
      u.last_active_at,
      u.created_at,
      s.id        AS site_id,
      s.name      AS site_name,
      s.slug,
      s.current_score AS score
    FROM users u
    JOIN sites s ON s.owner_id = u.id
    WHERE u.is_pro = false
      AND s.is_listed = true
      AND (
        (u.last_active_at IS NOT NULL AND u.last_active_at < ${daysAgo(REMOVAL_DAYS)})
        OR
        (u.last_active_at IS NULL AND u.grandfather_warning_sent_at IS NOT NULL AND u.grandfather_warning_sent_at < ${daysAgo(GRANDFATHER_REMOVAL_DAYS)})
      )
    ORDER BY u.email, s.name
  `;

  if (rows.length === 0) {
    console.log("  No users to remove.");
    return;
  }

  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        lastActiveAt: row.last_active_at,
        createdAt: row.created_at,
        sites: [],
      });
    }
    byUser.get(row.user_id).sites.push({
      id: row.site_id,
      name: row.site_name,
      slug: row.slug,
      score: row.score,
    });
  }

  console.log(`  Found ${byUser.size} user(s) to remove:`);

  for (const user of byUser.values()) {
    const lastSeen = user.lastActiveAt
      ? `last seen ${user.lastActiveAt.toISOString().split("T")[0]}`
      : `never logged in, joined ${user.createdAt.toISOString().split("T")[0]}`;
    console.log(`\n  ${user.name} <${user.email}> (${lastSeen})`);
    for (const s of user.sites) {
      console.log(`    - ${s.name} (${s.slug}) — ${s.score}/100`);
    }

    if (!DRY_RUN) {
      const siteIds = user.sites.map((s) => s.id);
      await sql`
        UPDATE sites
        SET is_listed = false, monitoring_paused = true
        WHERE id = ANY(${sql.array(siteIds)}::uuid[])
      `;

      const mail = buildListingRemovalEmail(user.name, user.sites);
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: user.email,
          subject: mail.subject,
          html: mail.html,
        });
        console.log(`    ✓ Removed + emailed`);
      } catch (err) {
        console.error(`    ✗ Email failed: ${err.message}`);
      }

      await sleep(EMAIL_DELAY_MS);
    } else {
      console.log(`    [dry-run] Would remove listing and send email`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Inactivity enforcement — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Threshold: pause at ${PAUSE_DAYS}d, remove at ${REMOVAL_DAYS}d`);
  console.log(`Grandfathered (never active): warn once, pause at +${GRANDFATHER_PAUSE_DAYS}d, remove at +${GRANDFATHER_REMOVAL_DAYS}d`);
  console.log(`Time: ${new Date().toISOString()}`);

  await runGrandfatherWarningPass();
  await runPausePass();
  await runRemovalPass();

  console.log("\nDone.");
  await sql.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
