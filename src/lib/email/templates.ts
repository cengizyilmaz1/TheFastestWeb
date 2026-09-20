// Shared email styles
const colors = {
  bg: "#110F0D",
  cardBg: "#1A1816",
  border: "#2A2725",
  text: "#E8E2DA",
  textSecondary: "#9C9590",
  textMuted: "#6B6560",
  accent: "#F59E0B",
  accentBright: "#FBBF24",
  green: "#22C55E",
};

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://thefastestweb.site";

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TheFastestWeb</title>
</head>
<body style="margin:0;padding:0;background-color:${colors.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${BASE_URL}" style="text-decoration:none;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
          <tr>
            <td style="vertical-align:middle;padding-right:10px;">
              <img src="${BASE_URL}/logo.png" alt="TheFastestWeb" width="40" height="28" style="display:block;" />
            </td>
            <td style="vertical-align:middle;">
              <span style="font-weight:800;font-size:18px;color:${colors.text};letter-spacing:-0.02em;">TheFastestWeb</span>
            </td>
          </tr>
        </table>
      </a>
    </div>

    <!-- Card -->
    <div style="background-color:${colors.cardBg};border:1px solid ${colors.border};border-radius:14px;padding:32px;margin-bottom:24px;">
      ${content}
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:8px;">
      <p style="font-size:12px;color:${colors.textMuted};margin:0 0 4px;">
        <a href="${BASE_URL}" style="color:${colors.textMuted};text-decoration:none;">TheFastestWeb</a>
        &nbsp;&middot;&nbsp;Speed Rankings for the Web
      </p>
      <p style="font-size:11px;color:${colors.textMuted};margin:0;">
        You received this because you signed up at thefastestweb.site
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function welcomeEmail(name: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0];

  const content = `
      <!-- Heading -->
      <h1 style="font-size:22px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        Welcome to TheFastestWeb
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 28px;text-align:center;line-height:1.5;">
        Hey ${firstName}, your account is ready. Here&apos;s what you can do now.
      </p>

      <!-- Steps -->
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
        <tr>
          <td style="width:28px;vertical-align:top;padding-right:14px;padding-bottom:16px;">
            <div style="width:28px;height:28px;border-radius:50%;background-color:${colors.accent};color:${colors.bg};font-weight:700;font-size:13px;text-align:center;line-height:28px;">1</div>
          </td>
          <td style="vertical-align:top;padding-bottom:16px;">
            <div style="font-weight:700;font-size:14px;color:${colors.text};margin-bottom:2px;">Submit your website</div>
            <div style="font-size:13px;color:${colors.textSecondary};line-height:1.4;">We'll test your speed and list you on the leaderboard.</div>
          </td>
        </tr>
        <tr>
          <td style="width:28px;vertical-align:top;padding-right:14px;padding-bottom:16px;">
            <div style="width:28px;height:28px;border-radius:50%;background-color:${colors.accent};color:${colors.bg};font-weight:700;font-size:13px;text-align:center;line-height:28px;">2</div>
          </td>
          <td style="vertical-align:top;padding-bottom:16px;">
            <div style="font-weight:700;font-size:14px;color:${colors.text};margin-bottom:2px;">Get daily monitoring</div>
            <div style="font-size:13px;color:${colors.textSecondary};line-height:1.4;">We re-test every listed site daily and track performance over time.</div>
          </td>
        </tr>
        <tr>
          <td style="width:28px;vertical-align:top;padding-right:14px;">
            <div style="width:28px;height:28px;border-radius:50%;background-color:${colors.accent};color:${colors.bg};font-weight:700;font-size:13px;text-align:center;line-height:28px;">3</div>
          </td>
          <td style="vertical-align:top;">
            <div style="font-weight:700;font-size:14px;color:${colors.text};margin-bottom:2px;">Earn a backlink</div>
            <div style="font-size:13px;color:${colors.textSecondary};line-height:1.4;">Every listed site gets a permanent backlink from our leaderboard.</div>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="${BASE_URL}/submit" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          Submit Your Site
        </a>
      </div>

      <!-- Plan info -->
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid ${colors.border};text-align:center;">
        <p style="font-size:12px;color:${colors.textMuted};margin:0;line-height:1.5;">
          You're on the <strong style="color:${colors.textSecondary};">Free plan</strong> (1 site, nofollow backlink).
          <br />
          <a href="${BASE_URL}/pricing" style="color:${colors.accent};text-decoration:none;">Upgrade to Pro</a> for unlimited sites, dofollow backlinks, and unlimited tracking.
        </p>
      </div>`;

  return {
    subject: "Welcome to TheFastestWeb",
    html: emailWrapper(content),
  };
}

export function proUpgradeEmail(name: string): {
  subject: string;
  html: string;
} {
  const firstName = name.split(" ")[0];

  const content = `
      <!-- Badge -->
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
          Pro Member
        </div>
      </div>

      <!-- Heading -->
      <h1 style="font-size:22px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        You're now a Pro!
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 28px;text-align:center;line-height:1.5;">
        Thanks ${firstName}! Your account has been upgraded. Here's everything that's now unlocked.
      </p>

      <!-- Features -->
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
        <tr>
          <td style="width:24px;vertical-align:top;padding-right:12px;padding-bottom:12px;">
            <div style="color:${colors.green};font-size:16px;">&#10003;</div>
          </td>
          <td style="vertical-align:top;padding-bottom:12px;">
            <div style="font-weight:600;font-size:14px;color:${colors.text};">Unlimited website listings</div>
            <div style="font-size:12px;color:${colors.textSecondary};">Submit as many sites as you want to the leaderboard.</div>
          </td>
        </tr>
        <tr>
          <td style="width:24px;vertical-align:top;padding-right:12px;padding-bottom:12px;">
            <div style="color:${colors.green};font-size:16px;">&#10003;</div>
          </td>
          <td style="vertical-align:top;padding-bottom:12px;">
            <div style="font-weight:600;font-size:14px;color:${colors.text};">Dofollow backlinks</div>
            <div style="font-size:12px;color:${colors.textSecondary};">All your sites now get SEO-boosting dofollow links.</div>
          </td>
        </tr>
        <tr>
          <td style="width:24px;vertical-align:top;padding-right:12px;padding-bottom:12px;">
            <div style="color:${colors.green};font-size:16px;">&#10003;</div>
          </td>
          <td style="vertical-align:top;padding-bottom:12px;">
            <div style="font-weight:600;font-size:14px;color:${colors.text};">Unlimited tracking history</div>
            <div style="font-size:12px;color:${colors.textSecondary};">Full performance history with 30D, 90D, and all-time views.</div>
          </td>
        </tr>
        <tr>
          <td style="width:24px;vertical-align:top;padding-right:12px;">
            <div style="color:${colors.green};font-size:16px;">&#10003;</div>
          </td>
          <td style="vertical-align:top;">
            <div style="font-weight:600;font-size:14px;color:${colors.text};">Priority support</div>
            <div style="font-size:12px;color:${colors.textSecondary};">Get help faster when you need it.</div>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="${BASE_URL}/submit" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          Submit More Sites
        </a>
      </div>

      <!-- Receipt note -->
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid ${colors.border};text-align:center;">
        <p style="font-size:12px;color:${colors.textMuted};margin:0;line-height:1.5;">
          This is a one-time purchase of <strong style="color:${colors.textSecondary};">$9</strong>. No recurring charges.
          <br />
          Your Pro benefits are active forever.
        </p>
      </div>`;

  return {
    subject: "You're now a Pro member!",
    html: emailWrapper(content),
  };
}

export function adSlotConfirmationEmail(
  name: string,
  adName: string,
  adTagline: string
): { subject: string; html: string } {
  const firstName = name.split(" ")[0];

  const content = `
      <!-- Heading -->
      <h1 style="font-size:22px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        Your Ad Is Live!
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 28px;text-align:center;line-height:1.5;">
        Hey ${firstName}, your featured placement is now active on every page.
      </p>

      <!-- Ad Preview -->
      <div style="background-color:${colors.bg};border:1px solid ${colors.border};border-radius:10px;padding:16px;margin-bottom:24px;text-align:center;">
        <div style="font-size:11px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Your Ad</div>
        <div style="font-weight:700;font-size:15px;color:${colors.text};margin-bottom:4px;">${adName}</div>
        <div style="font-size:13px;color:${colors.textSecondary};">${adTagline}</div>
      </div>

      <!-- Details -->
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
        <tr>
          <td style="width:24px;vertical-align:middle;padding-right:12px;padding-bottom:12px;">
            <div style="color:${colors.green};font-size:16px;">&#10003;</div>
          </td>
          <td style="vertical-align:middle;padding-bottom:12px;">
            <div style="font-size:14px;color:${colors.text};">Visible on every page of the site</div>
          </td>
        </tr>
        <tr>
          <td style="width:24px;vertical-align:middle;padding-right:12px;padding-bottom:12px;">
            <div style="color:${colors.green};font-size:16px;">&#10003;</div>
          </td>
          <td style="vertical-align:middle;padding-bottom:12px;">
            <div style="font-size:14px;color:${colors.text};">Included in our weekly recap email</div>
          </td>
        </tr>
        <tr>
          <td style="width:24px;vertical-align:middle;padding-right:12px;">
            <div style="color:${colors.green};font-size:16px;">&#10003;</div>
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:14px;color:${colors.text};">Direct link to your website</div>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="${BASE_URL}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          View Leaderboard
        </a>
      </div>

      <!-- Subscription note -->
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid ${colors.border};text-align:center;">
        <p style="font-size:12px;color:${colors.textMuted};margin:0;line-height:1.5;">
          Your subscription is <strong style="color:${colors.textSecondary};">$19/month</strong>. Manage your subscription using the link in your Dodo Payments receipt.
        </p>
      </div>`;

  return {
    subject: "Your ad is live on TheFastestWeb!",
    html: emailWrapper(content),
  };
}

interface TrendDay {
  date: string; // e.g. "Feb 10"
  score: number;
}

export function speedTrendAlertEmail(
  name: string,
  siteName: string,
  siteSlug: string,
  trend: TrendDay[],
  latestMetrics?: { fcp?: string; lcp?: string; cls?: string; tbt?: string; si?: string }
): { subject: string; html: string } {
  const firstName = name.split(" ")[0];
  const startScore = trend[0].score;
  const endScore = trend[trend.length - 1].score;
  const totalDrop = startScore - endScore;
  const days = trend.length;
  const scoreColor = endScore >= 90 ? colors.green : endScore >= 50 ? colors.accent : "#EF4444";

  const trendRows = trend
    .map((day, i) => {
      const prev = i > 0 ? trend[i - 1].score : null;
      const diff = prev !== null ? day.score - prev : 0;
      const diffColor = diff > 0 ? colors.green : diff < 0 ? "#EF4444" : colors.textMuted;
      const diffText = prev !== null ? (diff > 0 ? `+${diff}` : `${diff}`) : "-";
      const dayScoreColor = day.score >= 90 ? colors.green : day.score >= 50 ? colors.accent : "#EF4444";
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${colors.border};font-size:13px;color:${colors.textSecondary};">${day.date}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${colors.border};text-align:center;font-weight:800;font-size:15px;color:${dayScoreColor};font-family:monospace;">${day.score}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${colors.border};text-align:right;font-weight:600;font-size:13px;color:${diffColor};font-family:monospace;">${diffText}</td>
        </tr>`;
    })
    .join("");

  const metricsHtml = latestMetrics ? `
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
        <tr>
          ${["FCP", "LCP", "CLS"].map(m => `<td style="padding:4px;width:33.3%;"><div style="background:${colors.bg};border:1px solid ${colors.border};border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:${colors.textMuted};text-transform:uppercase;margin-bottom:4px;">${m}</div>
            <div style="font-size:14px;font-weight:700;color:${colors.text};font-family:monospace;">${latestMetrics[m.toLowerCase() as keyof typeof latestMetrics] || "N/A"}</div>
          </div></td>`).join("")}
        </tr>
        <tr>
          ${["TBT", "SI"].map(m => `<td style="padding:4px;width:33.3%;"><div style="background:${colors.bg};border:1px solid ${colors.border};border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:${colors.textMuted};text-transform:uppercase;margin-bottom:4px;">${m}</div>
            <div style="font-size:14px;font-weight:700;color:${colors.text};font-family:monospace;">${latestMetrics[m.toLowerCase() as keyof typeof latestMetrics] || "N/A"}</div>
          </div></td>`).join("")}
          <td style="padding:4px;width:33.3%;"></td>
        </tr>
      </table>` : "";

  const content = `
      <!-- Alert badge -->
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;padding:4px 14px;border-radius:20px;background-color:rgba(239,68,68,0.15);color:#EF4444;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
          Speed Trend Alert
        </div>
      </div>

      <!-- Heading -->
      <h1 style="font-size:22px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        ${siteName} declining for ${days} days
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 24px;text-align:center;line-height:1.5;">
        Hey ${firstName}, ${siteName} has been steadily slowing down — dropping ${totalDrop} points over the last ${days} days.
      </p>

      <!-- Trend table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;font-size:10px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${colors.border};">Day</th>
            <th style="text-align:center;padding-bottom:8px;font-size:10px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${colors.border};">Score</th>
            <th style="text-align:right;padding-bottom:8px;font-size:10px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${colors.border};">Change</th>
          </tr>
        </thead>
        <tbody>${trendRows}</tbody>
      </table>

      <!-- Latest score highlight -->
      <div style="background-color:${colors.bg};border:1px solid ${colors.border};border-radius:10px;padding:16px;text-align:center;margin-bottom:24px;">
        <div style="font-size:11px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Current Score</div>
        <div style="font-size:36px;font-weight:800;color:${scoreColor};">${endScore}</div>
        <div style="font-size:12px;color:#EF4444;margin-top:4px;">-${totalDrop} from ${days} days ago</div>
      </div>

      ${metricsHtml}

      <!-- Tips -->
      <div style="background-color:${colors.bg};border:1px solid ${colors.border};border-radius:10px;padding:16px;margin-bottom:24px;">
        <div style="font-weight:700;font-size:13px;color:${colors.text};margin-bottom:8px;">What to check</div>
        <div style="font-size:12px;color:${colors.textSecondary};line-height:1.6;">
          &bull; Recent deployments that added new scripts or assets<br />
          &bull; Third-party services or ads impacting load time<br />
          &bull; Server or hosting performance degradation<br />
          &bull; Large images or media added without optimization
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="${BASE_URL}/site/${siteSlug}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          View Full Report
        </a>
      </div>`;

  return {
    subject: `Speed trend alert: ${siteName} dropped ${totalDrop} points over ${days} days`,
    html: emailWrapper(content),
  };
}

interface WeeklyRecapSite {
  name: string;
  slug: string;
  score: number;
  previousScore: number;
  rank: number;
}

interface WeeklyRecapSponsor {
  name: string;
  tagline: string;
  url: string;
  faviconUrl?: string;
}

export function weeklyRecapEmail(
  name: string,
  sites: WeeklyRecapSite[],
  sponsors?: WeeklyRecapSponsor[]
): { subject: string; html: string } {
  const firstName = name.split(" ")[0];

  const siteRows = sites
    .map((site) => {
      const diff = site.score - site.previousScore;
      const diffColor = diff > 0 ? colors.green : diff < 0 ? "#EF4444" : colors.textMuted;
      const diffText = diff > 0 ? `+${diff}` : diff === 0 ? "0" : `${diff}`;
      const scoreColor = site.score >= 90 ? colors.green : site.score >= 50 ? colors.accent : "#EF4444";

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${colors.border};">
            <a href="${BASE_URL}/site/${site.slug}" style="font-weight:600;font-size:14px;color:${colors.text};text-decoration:none;">${site.name}</a>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid ${colors.border};text-align:center;">
            <span style="font-weight:800;font-size:16px;color:${scoreColor};font-family:monospace;">${site.score}</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid ${colors.border};text-align:center;">
            <span style="font-weight:600;font-size:13px;color:${diffColor};font-family:monospace;">${diffText}</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid ${colors.border};text-align:right;">
            <span style="font-size:13px;color:${colors.textSecondary};">#${site.rank}</span>
          </td>
        </tr>`;
    })
    .join("");

  const content = `
      <!-- Heading -->
      <h1 style="font-size:22px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        Your Weekly Recap
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 28px;text-align:center;line-height:1.5;">
        Hey ${firstName}, here's how your sites performed this week.
      </p>

      <!-- Sites table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;font-size:11px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${colors.border};">Site</th>
            <th style="text-align:center;padding-bottom:8px;font-size:11px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${colors.border};">Score</th>
            <th style="text-align:center;padding-bottom:8px;font-size:11px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${colors.border};">Change</th>
            <th style="text-align:right;padding-bottom:8px;font-size:11px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${colors.border};">Rank</th>
          </tr>
        </thead>
        <tbody>
          ${siteRows}
        </tbody>
      </table>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="${BASE_URL}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          View Full Leaderboard
        </a>
      </div>

      ${
        sponsors && sponsors.length > 0
          ? `<!-- Sponsored -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${colors.border};">
        <div style="font-size:10px;color:${colors.textMuted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;text-align:center;">Sponsored</div>
        <table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
          ${sponsors
            .reduce<WeeklyRecapSponsor[][]>((rows, s, i) => {
              if (i % 2 === 0) rows.push([s]);
              else rows[rows.length - 1].push(s);
              return rows;
            }, [])
            .map(
              (pair) => `
          <tr>
            ${pair
              .map(
                (s) => `
            <td style="padding:4px;width:50%;vertical-align:top;">
              <a href="${s.url}" target="_blank" style="display:block;background-color:${colors.bg};border:1px solid ${colors.border};border-radius:8px;padding:10px 12px;text-decoration:none;">
                <div style="font-weight:700;font-size:12px;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
                <div style="font-size:11px;color:${colors.textSecondary};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${s.tagline}</div>
              </a>
            </td>`
              )
              .join("")}
            ${pair.length === 1 ? `<td style="padding:4px;width:50%;"></td>` : ""}
          </tr>`
            )
            .join("")}
        </table>
      </div>`
          : ""
      }

      <!-- Footer note -->
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid ${colors.border};text-align:center;">
        <p style="font-size:12px;color:${colors.textMuted};margin:0;line-height:1.5;">
          We test your sites daily and send this recap every Monday.
        </p>
      </div>`;

  return {
    subject: `Weekly recap: ${sites.length === 1 ? sites[0].name + " scored " + sites[0].score : sites.length + " sites tracked"}`,
    html: emailWrapper(content),
  };
}

export function monitoringPauseEmail(
  name: string,
  sites: { name: string; slug: string; score: number }[]
): { subject: string; html: string } {
  const firstName = name.split(" ")[0];
  const siteList = sites
    .map(
      (s) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${colors.border};">
          <a href="${BASE_URL}/site/${s.slug}" style="font-weight:600;font-size:14px;color:${colors.text};text-decoration:none;">${s.name}</a>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid ${colors.border};text-align:right;">
          <span style="font-family:monospace;font-weight:700;font-size:14px;color:${s.score >= 90 ? colors.green : s.score >= 50 ? colors.accent : "#EF4444"};">${s.score}/100</span>
        </td>
      </tr>`
    )
    .join("");

  const content = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background-color:#1A1816;border:1px solid #2A2725;line-height:48px;font-size:22px;">⏸</div>
      </div>
      <h1 style="font-size:20px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        Speed monitoring paused
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 24px;text-align:center;line-height:1.5;">
        Hey ${firstName}, we haven't seen you in 10 days so we've paused daily retesting for your ${sites.length === 1 ? "site" : "sites"}. Your listing is still live.
      </p>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
        ${siteList}
      </table>

      <p style="font-size:13px;color:${colors.textSecondary};margin:0 0 20px;line-height:1.5;text-align:center;">
        Log in to reactivate monitoring instantly. If you don't log in within the next 20 days, your listing will be removed.
      </p>

      <div style="text-align:center;margin-bottom:20px;">
        <a href="${BASE_URL}/submit" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          Log In to Reactivate
        </a>
      </div>

      <div style="padding:16px;border-radius:10px;background-color:${colors.bg};border:1px solid ${colors.border};text-align:center;">
        <p style="font-size:12px;color:${colors.textMuted};margin:0;line-height:1.5;">
          Want monitoring without worrying about this?
          <a href="${BASE_URL}/pricing" style="color:${colors.accent};text-decoration:none;">Upgrade to Pro</a>
          for always-on monitoring, dofollow backlinks, and weekly recap emails.
        </p>
      </div>`;

  return {
    subject: `Speed monitoring paused for ${sites.length === 1 ? sites[0].name : `your ${sites.length} sites`}`,
    html: emailWrapper(content),
  };
}

export function listingRemovalEmail(
  name: string,
  sites: { name: string; slug: string; score: number }[]
): { subject: string; html: string } {
  const firstName = name.split(" ")[0];
  const siteList = sites
    .map(
      (s) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${colors.border};">
          <span style="font-weight:600;font-size:14px;color:${colors.textMuted};">${s.name}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid ${colors.border};text-align:right;">
          <span style="font-family:monospace;font-weight:700;font-size:14px;color:${colors.textMuted};">was ${s.score}/100</span>
        </td>
      </tr>`
    )
    .join("");

  const content = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background-color:#1A1816;border:1px solid #2A2725;line-height:48px;font-size:22px;">🗑</div>
      </div>
      <h1 style="font-size:20px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        Your listing has been removed
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 24px;text-align:center;line-height:1.5;">
        Hey ${firstName}, your ${sites.length === 1 ? "site has" : `${sites.length} sites have`} been removed from TheFastestWeb after 30 days of inactivity.
      </p>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
        ${siteList}
      </table>

      <p style="font-size:13px;color:${colors.textSecondary};margin:0 0 20px;line-height:1.5;text-align:center;">
        You can resubmit any time — log in and go through the submit flow again. All previous history is still saved.
      </p>

      <div style="text-align:center;margin-bottom:20px;">
        <a href="${BASE_URL}/submit" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          Resubmit Your Site
        </a>
      </div>

      <div style="padding:16px;border-radius:10px;background-color:${colors.bg};border:1px solid ${colors.border};text-align:center;">
        <p style="font-size:12px;color:${colors.textMuted};margin:0;line-height:1.5;">
          Upgrade to <a href="${BASE_URL}/pricing" style="color:${colors.accent};text-decoration:none;">Pro</a> and your listing stays active forever — no check-ins required.
        </p>
      </div>`;

  return {
    subject: `Your listing${sites.length > 1 ? "s have" : " has"} been removed from TheFastestWeb`,
    html: emailWrapper(content),
  };
}

export function badgeDeletionEmail(
  name: string,
  siteName: string,
  siteUrl: string
): { subject: string; html: string } {
  const firstName = name.split(" ")[0];

  const content = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background-color:#1A1816;border:1px solid ${colors.border};line-height:48px;font-size:22px;text-align:center;">🗑️</div>
      </div>
      <h1 style="font-size:20px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        Your listing has been deleted
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 24px;text-align:center;line-height:1.5;">
        Hey ${firstName}, your site <strong style="color:${colors.text};">${siteName}</strong> has been permanently removed from TheFastestWeb.
      </p>

      <div style="padding:16px;border-radius:10px;background-color:${colors.bg};border:1px solid ${colors.border};margin-bottom:24px;">
        <p style="font-size:13px;color:${colors.textSecondary};margin:0;line-height:1.6;">
          We sent a warning yesterday after the TheFastestWeb badge was no longer detected on <a href="${siteUrl}" style="color:${colors.accent};text-decoration:none;">${siteUrl}</a>. The badge was still missing on today's check, so your listing and all its speed history have been deleted.
        </p>
      </div>

      <p style="font-size:13px;color:${colors.textSecondary};margin:0 0 20px;line-height:1.5;text-align:center;">
        You can resubmit any time — just add the badge back to your homepage and go through the submit flow again.
      </p>

      <div style="text-align:center;margin-bottom:20px;">
        <a href="${BASE_URL}/submit" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          Resubmit Your Site
        </a>
      </div>

      <div style="padding:16px;border-radius:10px;background-color:${colors.bg};border:1px solid ${colors.border};text-align:center;">
        <p style="font-size:12px;color:${colors.textMuted};margin:0;line-height:1.5;">
          On <a href="${BASE_URL}/pricing" style="color:${colors.accent};text-decoration:none;">Pro</a>, there's no badge requirement and your listing is permanent.
          <br />If you think this is a mistake, just reply to this email.
        </p>
      </div>`;

  return {
    subject: `Your listing has been removed from TheFastestWeb`,
    html: emailWrapper(content),
  };
}

export function badgeWarningEmail(
  name: string,
  siteName: string,
  siteUrl: string,
  slug: string
): { subject: string; html: string } {
  const firstName = name.split(" ")[0];
  const badgeImgUrl = `${BASE_URL}/api/badge/${slug}`;
  const sitePageUrl = `${BASE_URL}/site/${slug}`;
  const embedCode = `&lt;a href="${sitePageUrl}" target="_blank"&gt;\n  &lt;img src="${badgeImgUrl}" alt="TheFastestWeb Speed Badge" /&gt;\n&lt;/a&gt;`;

  const content = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background-color:#1A1816;border:1px solid ${colors.border};line-height:48px;font-size:22px;">⚠️</div>
      </div>
      <h1 style="font-size:20px;font-weight:800;color:${colors.text};margin:0 0 8px;text-align:center;">
        Badge not found — action required
      </h1>
      <p style="font-size:14px;color:${colors.textSecondary};margin:0 0 24px;text-align:center;line-height:1.5;">
        Hey ${firstName}, we couldn't find the TheFastestWeb badge on <strong style="color:${colors.text};">${siteName}</strong>.
      </p>

      <div style="padding:16px;border-radius:10px;background-color:${colors.bg};border:1px solid ${colors.border};margin-bottom:24px;">
        <p style="font-size:13px;color:${colors.textSecondary};margin:0 0 4px;line-height:1.5;">
          The free plan requires the badge to stay embedded on your homepage. Your listing has been temporarily removed from the leaderboard.
        </p>
        <p style="font-size:13px;color:${colors.text};margin:0;font-weight:700;line-height:1.5;margin-top:8px;">
          If the badge is still missing on our next daily check, your listing and all its data will be permanently deleted.
        </p>
      </div>

      <p style="font-size:13px;color:${colors.textSecondary};margin:0 0 12px;line-height:1.5;">
        To restore your listing, add this to your homepage:
      </p>
      <div style="background-color:${colors.bg};border:1px solid ${colors.border};border-radius:8px;padding:14px;margin-bottom:24px;">
        <code style="font-family:monospace;font-size:12px;color:${colors.textSecondary};white-space:pre-wrap;display:block;line-height:1.6;">${embedCode}</code>
      </div>

      <div style="text-align:center;margin-bottom:20px;">
        <a href="${sitePageUrl}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,${colors.accent},${colors.accentBright});color:${colors.bg};font-weight:700;font-size:15px;text-decoration:none;">
          View Your Site Page
        </a>
      </div>

      <div style="padding:16px;border-radius:10px;background-color:${colors.bg};border:1px solid ${colors.border};text-align:center;">
        <p style="font-size:12px;color:${colors.textMuted};margin:0;line-height:1.5;">
          On <a href="${BASE_URL}/pricing" style="color:${colors.accent};text-decoration:none;">Pro</a>, there's no badge requirement and your listing is permanent.
          <br />If you think this is a mistake, just reply to this email.
        </p>
      </div>`;

  return {
    subject: `Action required: TheFastestWeb badge missing on ${siteName}`,
    html: emailWrapper(content),
  };
}
