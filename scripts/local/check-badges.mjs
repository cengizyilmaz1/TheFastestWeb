/**
 * Daily badge check — verifies that free sites with requiresBadge=true
 * still have the TheFastestWeb badge on their homepage.
 *
 * Flow:
 *   1st failure → send warning email, set badge_warning_sent_at
 *   2nd+ failure (warning already sent) → delete site + all speed tests
 *
 * Usage:
 *   node scripts/local/check-badges.mjs
 *   node scripts/local/check-badges.mjs --dry-run
 */

import postgres from "postgres";
import { Resend } from "resend";
import puppeteer from "puppeteer-core";
import { env } from "./env.mjs";

const BASE_URL = "https://thefastestweb.site";
const CHROMIUM_VERSION = "149.0.0";
const CHROMIUM_PACK_URL = `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.tar`;
const LOCAL_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const c = {
  bg: "#110F0D", cardBg: "#1A1816", border: "#2A2725",
  text: "#E8E2DA", textSec: "#9C9590", textMuted: "#6B6560",
  accent: "#F59E0B", accentBright: "#FBBF24",
};

function buildWarningEmail(ownerName, siteName, siteUrl, slug) {
  const firstName = ownerName.split(" ")[0];
  const sitePageUrl = `${BASE_URL}/site/${slug}`;
  const badgeImgUrl = `${BASE_URL}/api/badge/${slug}`;
  const embedCode = `&lt;a href="${sitePageUrl}" target="_blank"&gt;\n  &lt;img src="${badgeImgUrl}" alt="TheFastestWeb Speed Badge" /&gt;\n&lt;/a&gt;`;

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
      <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background-color:${c.bg};border:1px solid ${c.border};line-height:48px;font-size:22px;text-align:center;">⚠️</div>
    </div>
    <h1 style="font-size:20px;font-weight:800;color:${c.text};margin:0 0 8px;text-align:center;">Badge not found — action required</h1>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 24px;text-align:center;line-height:1.5;">
      Hey ${firstName}, we couldn't find the TheFastestWeb badge on <strong style="color:${c.text};">${siteName}</strong>.
    </p>
    <div style="padding:16px;border-radius:10px;background-color:${c.bg};border:1px solid ${c.border};margin-bottom:24px;">
      <p style="font-size:13px;color:${c.textSec};margin:0 0 8px;line-height:1.5;">
        The free plan requires the badge to stay embedded on your homepage. Your listing has been temporarily removed from the leaderboard.
      </p>
      <p style="font-size:13px;color:${c.text};font-weight:700;margin:0;line-height:1.5;">
        If the badge is still missing on our next daily check, your listing and all its data will be permanently deleted.
      </p>
    </div>
    <p style="font-size:13px;color:${c.textSec};margin:0 0 12px;line-height:1.5;">To restore your listing, add this to your homepage:</p>
    <div style="background-color:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:14px;margin-bottom:24px;">
      <code style="font-family:monospace;font-size:12px;color:${c.textSec};white-space:pre-wrap;display:block;line-height:1.6;">${embedCode}</code>
    </div>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${sitePageUrl}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${c.accent},${c.accentBright});color:${c.bg};font-weight:700;font-size:15px;text-decoration:none;">View Your Site Page</a>
    </div>
    <div style="padding:16px;border-radius:10px;background-color:${c.bg};border:1px solid ${c.border};text-align:center;">
      <p style="font-size:12px;color:${c.textMuted};margin:0;line-height:1.5;">
        On <a href="${BASE_URL}/pricing" style="color:${c.accent};text-decoration:none;">Pro</a>, there's no badge requirement and your listing is permanent.
        <br />If you think this is a mistake, just reply to this email.
      </p>
    </div>
  </div>
  <div style="text-align:center;padding-top:8px;">
    <p style="font-size:12px;color:${c.textMuted};margin:0 0 4px;">
      <a href="${BASE_URL}" style="color:${c.textMuted};text-decoration:none;">TheFastestWeb</a> &middot; Speed Rankings for the Web
    </p>
    <p style="font-size:11px;color:${c.textMuted};margin:0;">You received this because you signed up at thefastestweb.site</p>
  </div>
</div>
</body></html>`;

  return {
    subject: `Action required: TheFastestWeb badge missing on ${siteName}`,
    html,
  };
}

function buildDeletionEmail(ownerName, siteName, siteUrl) {
  const firstName = ownerName.split(" ")[0];

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
      <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background-color:${c.bg};border:1px solid ${c.border};line-height:48px;font-size:22px;text-align:center;">🗑️</div>
    </div>
    <h1 style="font-size:20px;font-weight:800;color:${c.text};margin:0 0 8px;text-align:center;">Your listing has been deleted</h1>
    <p style="font-size:14px;color:${c.textSec};margin:0 0 24px;text-align:center;line-height:1.5;">
      Hey ${firstName}, your site <strong style="color:${c.text};">${siteName}</strong> has been permanently removed from TheFastestWeb.
    </p>
    <div style="padding:16px;border-radius:10px;background-color:${c.bg};border:1px solid ${c.border};margin-bottom:24px;">
      <p style="font-size:13px;color:${c.textSec};margin:0;line-height:1.6;">
        We sent a warning yesterday after the TheFastestWeb badge was no longer detected on <a href="${siteUrl}" style="color:${c.accent};text-decoration:none;">${siteUrl}</a>. The badge was still missing on today's check, so your listing and all its speed history have been deleted.
      </p>
    </div>
    <p style="font-size:13px;color:${c.textSec};margin:0 0 20px;line-height:1.5;text-align:center;">
      You can resubmit any time — just add the badge back to your homepage and go through the submit flow again.
    </p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${BASE_URL}/submit" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${c.accent},${c.accentBright});color:${c.bg};font-weight:700;font-size:15px;text-decoration:none;">Resubmit Your Site</a>
    </div>
    <div style="padding:16px;border-radius:10px;background-color:${c.bg};border:1px solid ${c.border};text-align:center;">
      <p style="font-size:12px;color:${c.textMuted};margin:0;line-height:1.5;">
        On <a href="${BASE_URL}/pricing" style="color:${c.accent};text-decoration:none;">Pro</a>, there's no badge requirement and your listing is permanent.
        <br />If you think this is a mistake, just reply to this email.
      </p>
    </div>
  </div>
  <div style="text-align:center;padding-top:8px;">
    <p style="font-size:12px;color:${c.textMuted};margin:0 0 4px;">
      <a href="${BASE_URL}" style="color:${c.textMuted};text-decoration:none;">TheFastestWeb</a> &middot; Speed Rankings for the Web
    </p>
    <p style="font-size:11px;color:${c.textMuted};margin:0;">You received this because you signed up at thefastestweb.site</p>
  </div>
</div>
</body></html>`;

  return {
    subject: `Your listing has been removed from TheFastestWeb`,
    html,
  };
}

const isDryRun = process.argv.includes("--dry-run");
const sql = postgres(env.DATABASE_URL);
const resend = new Resend(env.RESEND_API_KEY);
const FROM_EMAIL = "TheFastestWeb <noreply@thefastestweb.site>";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Fallback for client-rendered (SPA) sites where the badge is injected by
// JavaScript and never appears in the raw server HTML.
async function findInRenderedDom(url, needle) {
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

  const browser = await puppeteer.launch({
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

async function checkBadge(url, slug) {
  const needle = `thefastestweb.site/api/badge/${slug}`;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TheFastestWebBot/1.0; +https://thefastestweb.site)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status}` };
    const html = await resp.text();
    if (html.includes(needle)) return { ok: true };

    // Not in the raw HTML — the site may render the badge client-side.
    try {
      const found = await findInRenderedDom(url, needle);
      return { ok: found };
    } catch (renderErr) {
      return { ok: false, reason: `render check failed: ${renderErr.message}` };
    }
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function main() {
  console.log(`=== TheFastestWeb Badge Check${isDryRun ? " (DRY RUN)" : ""} ===\n`);

  const sites = await sql`
    SELECT s.id, s.slug, s.name, s.url, s.is_listed, s.badge_warning_sent_at,
           u.email as owner_email, u.name as owner_name
    FROM sites s
    LEFT JOIN users u ON u.id = s.owner_id
    WHERE s.requires_badge = true
    ORDER BY s.name ASC
  `;

  console.log(`Checking ${sites.length} sites with badge requirement...\n`);

  let passed = 0;
  let warned = 0;
  let deleted = 0;

  for (const site of sites) {
    const { ok, reason } = await checkBadge(site.url, site.slug);

    if (ok) {
      console.log(`  [PASS] ${site.name}`);
      // Clear warning and re-list if needed
      if (site.badge_warning_sent_at || !site.is_listed) {
        console.log(`    -> Clearing warning, restoring listing`);
        if (!isDryRun) {
          await sql`UPDATE sites SET is_listed = true, badge_warning_sent_at = null WHERE id = ${site.id}`;
        }
      }
      passed++;
    } else {
      console.log(`  [FAIL] ${site.name} — badge not found${reason ? ` (${reason})` : ""}`);

      if (site.badge_warning_sent_at) {
        // Already warned — delete
        console.log(`    -> Warning was sent on ${new Date(site.badge_warning_sent_at).toISOString().slice(0, 10)}, ${isDryRun ? "would delete" : "deleting"} site permanently`);
        if (!isDryRun) {
          await sql`DELETE FROM speed_tests WHERE site_id = ${site.id}`;
          await sql`DELETE FROM sites WHERE id = ${site.id}`;
          if (site.owner_email) {
            const mail = buildDeletionEmail(site.owner_name, site.name, site.url);
            await resend.emails.send({
              from: FROM_EMAIL,
              to: site.owner_email,
              subject: mail.subject,
              html: mail.html,
            });
            console.log(`    -> Deletion email sent to ${site.owner_email}`);
          }
        }
        deleted++;
      } else {
        // First failure — warn
        console.log(`    -> First failure, ${isDryRun ? "would send" : "sending"} warning email to ${site.owner_email || "(no email)"}`);
        if (!isDryRun) {
          await sql`UPDATE sites SET is_listed = false, badge_warning_sent_at = now() WHERE id = ${site.id}`;
          if (site.owner_email) {
            const mail = buildWarningEmail(site.owner_name, site.name, site.url, site.slug);
            await resend.emails.send({
              from: FROM_EMAIL,
              to: site.owner_email,
              subject: mail.subject,
              html: mail.html,
            });
          }
        }
        warned++;
      }
    }

    await delay(1000);
  }

  console.log(`\n=== Done! Passed: ${passed}, Warned: ${warned}, Deleted: ${deleted} ===`);
  await sql.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
