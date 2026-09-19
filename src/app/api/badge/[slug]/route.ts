import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { sites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { escapeXml } from "@/lib/seo/xml";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return "#22c55e"; // green
  if (score >= 50) return "#f59e0b"; // amber
  return "#ef4444";                  // red
}

function clampDomain(domain: string): string {
  return escapeXml(domain.length > 26 ? domain.substring(0, 24) + "\u2026" : domain);
}

function domainFontSize(len: number): number {
  if (len <= 14) return 15;
  if (len <= 18) return 13.5;
  if (len <= 22) return 12.5;
  return 11.5;
}

function scoreDisplay(score: number): string {
  return String(score);
}

interface Tokens {
  bg: string; border: string; borderWidth: string; trackBg: string;
  numColor: string; domColor: string; subColor: string;
  divColor: string; brandColor: string;
}

function tok(isDark: boolean): Tokens {
  return isDark
    ? { bg: "#0f1115", border: "#1e2128", borderWidth: "1.2", trackBg: "#1e2128",
        numColor: "#ffffff", domColor: "#f0f0f0", subColor: "#4b5563",
        divColor: "#1e2128", brandColor: "#6b7280" }
    : { bg: "#ffffff", border: "#111827", borderWidth: "2", trackBg: "#e9ecef",
        numColor: "#111827", domColor: "#111827", subColor: "#9ca3af",
        divColor: "#e5e7eb", brandColor: "#6b7280" };
}

const toRad = (d: number) => (d * Math.PI) / 180;
const pt = (cx: number, cy: number, r: number, deg: number) =>
  [(cx + r * Math.cos(toRad(deg))).toFixed(2), (cy + r * Math.sin(toRad(deg))).toFixed(2)] as const;

// ─── Variant 1: Glow Donut ────────────────────────────────────────────────────

function buildGlow(score: number, domain: string, theme: "dark" | "light"): string {
  const isDark = theme === "dark";
  const t = tok(isDark);
  const color = scoreColor(score);
  const dom = clampDomain(domain);
  const fs = domainFontSize(dom.length);
  const sc = scoreDisplay(score);
  const r = 23, cx = 46, cy = 40;
  const circ = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(score / 100, 1)) * circ).toFixed(3);
  const c = circ.toFixed(3);
  const wash = isDark ? color + "28" : color + "18";
  const gradInner = isDark ? "#17191f" : "#f4f7ff";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="288" height="80" role="img" aria-label="Speed score ' + score + '/100 \u2014 TheFastestWeb">',
    '<title>Speed score ' + score + '/100 \u2014 TheFastestWeb</title>',
    '<defs>',
    '<filter id="glow1" x="-60%" y="-60%" width="220%" height="220%">',
    '<feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>',
    '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
    '<radialGradient id="wash1" cx="50%" cy="50%" r="50%">',
    '<stop offset="0%" stop-color="' + gradInner + '"/>',
    '<stop offset="100%" stop-color="' + wash + '"/>',
    '</radialGradient>',
    '<clipPath id="lp1"><rect width="86" height="80" rx="14"/></clipPath>',
    '</defs>',
    '<rect width="288" height="80" rx="14" fill="' + t.bg + '"/>',
    '<rect width="88" height="80" clip-path="url(#lp1)" fill="url(#wash1)"/>',
    '<rect width="288" height="80" rx="14" fill="none" stroke="' + t.border + '" stroke-width="' + t.borderWidth + '"/>',
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + t.trackBg + '" stroke-width="7"/>',
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="7" stroke-dasharray="' + filled + ' ' + c + '" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')" filter="url(#glow1)" opacity="0.5"/>',
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="7" stroke-dasharray="' + filled + ' ' + c + '" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>',
    '<text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="18" font-weight="800" fill="' + t.numColor + '">' + sc + '</text>',
    '<line x1="86" y1="14" x2="86" y2="66" stroke="' + t.divColor + '" stroke-width="1.2"/>',
    '<text x="100" y="35" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="' + fs + '" font-weight="700" fill="' + t.domColor + '">' + dom + '</text>',
    '<text x="100" y="51" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="9" fill="' + t.subColor + '" letter-spacing="1.5">CERTIFIED SPEED SCORE</text>',
    '<text x="276" y="73" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="8.5" fill="' + t.brandColor + '" letter-spacing="0.5">TheFastestWeb</text>',
    '</svg>',
  ].join("\n");
}

// ─── Variant 2: Speedometer (240° arc, needle, hub, ticks) ───────────────────

function buildSpeedometer(score: number, domain: string, theme: "dark" | "light"): string {
  const isDark = theme === "dark";
  const t = tok(isDark);
  const color = scoreColor(score);
  const dom = clampDomain(domain);
  const fs = domainFontSize(dom.length);
  const sc = scoreDisplay(score);

  // 240° arc: starts at 150° (7-o'clock), sweeps CW to 30° (5-o'clock)
  const cx = 54, cy = 48, r = 30;
  const startDeg = 150, sweepDeg = 240;

  // Track arc endpoints (150° → 30°, large arc, clockwise)
  const [tsx, tsy] = pt(cx, cy, r, startDeg);
  const [tex, tey] = pt(cx, cy, r, startDeg + sweepDeg);
  const trackPath = "M " + tsx + " " + tsy + " A " + r + " " + r + " 0 1 1 " + tex + " " + tey;

  // Filled arc
  const clampedScore = Math.max(0, Math.min(score, 100));
  const filledSweep = (clampedScore / 100) * sweepDeg;
  const filledEndDeg = startDeg + Math.max(filledSweep, 0.5);
  const [fex, fey] = pt(cx, cy, r, filledEndDeg);
  const filledLargeArc = filledSweep > 180 ? 1 : 0;
  const filledPath = clampedScore > 0
    ? "M " + tsx + " " + tsy + " A " + r + " " + r + " 0 " + filledLargeArc + " 1 " + fex + " " + fey
    : "";

  // Needle from hub to just inside arc
  const needleLen = r - 7;
  const [nx, ny] = pt(cx, cy, needleLen, filledEndDeg);

  // 5 tick marks radiating outside the arc
  const ticks = [0, 1, 2, 3, 4].map(i => {
    const deg = startDeg + i * sweepDeg / 4;
    const [x1, y1] = pt(cx, cy, r + 3, deg);
    const [x2, y2] = pt(cx, cy, r + 8, deg);
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + t.divColor + '" stroke-width="1.5" stroke-linecap="round"/>';
  }).join("\n  ");

  // 0 / 100 labels
  const [l0x, l0y] = pt(cx, cy, r + 12, startDeg);
  const [l100x, l100y] = pt(cx, cy, r + 12, startDeg + sweepDeg);

  const hubColor = clampedScore > 0 ? color : t.trackBg;

  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="288" height="80" role="img" aria-label="Speed score ' + score + '/100 \u2014 TheFastestWeb">',
    '<title>Speed score ' + score + '/100 \u2014 TheFastestWeb</title>',
    '<defs>',
    '<filter id="glow2" x="-80%" y="-80%" width="260%" height="260%">',
    '<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/>',
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
    '<linearGradient id="bgG2" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="' + (isDark ? "#131520" : "#f8faff") + '"/>',
    '<stop offset="100%" stop-color="' + (isDark ? "#0c0d12" : "#ffffff") + '"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="288" height="80" rx="14" fill="url(#bgG2)"/>',
    '<rect width="288" height="80" rx="14" fill="none" stroke="' + t.border + '" stroke-width="' + t.borderWidth + '"/>',
    '<!-- Track arc (240\u00b0) -->',
    '<path d="' + trackPath + '" fill="none" stroke="' + t.trackBg + '" stroke-width="6.5" stroke-linecap="round"/>',
    '<!-- Tick marks -->',
    ticks,
    '<!-- Filled arc glow -->',
    filledPath ? '<path d="' + filledPath + '" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round" filter="url(#glow2)" opacity="0.45"/>' : '',
    '<!-- Filled arc crisp -->',
    filledPath ? '<path d="' + filledPath + '" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round"/>' : '',
    '<!-- Needle -->',
    clampedScore > 0 ? '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx + '" y2="' + ny + '" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>' : '',
    '<!-- Hub -->',
    '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + hubColor + '"/>',
    '<circle cx="' + cx + '" cy="' + cy + '" r="2.5" fill="' + t.bg + '"/>',
    '<!-- Score number -->',
    '<text x="' + cx + '" y="76" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="17" font-weight="800" fill="' + t.numColor + '">' + sc + '</text>',
    '<!-- 0 / 100 labels -->',
    '<text x="' + l0x + '" y="' + (parseFloat(l0y) + 2).toFixed(1) + '" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="7" fill="' + t.subColor + '">0</text>',
    '<text x="' + l100x + '" y="' + (parseFloat(l100y) + 2).toFixed(1) + '" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="7" fill="' + t.subColor + '">100</text>',
    '<!-- Divider -->',
    '<line x1="108" y1="14" x2="108" y2="66" stroke="' + t.divColor + '" stroke-width="1.2"/>',
    '<!-- Domain -->',
    '<text x="122" y="35" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="' + fs + '" font-weight="700" fill="' + t.domColor + '">' + dom + '</text>',
    '<!-- Subtitle -->',
    '<text x="122" y="51" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="9" fill="' + t.subColor + '" letter-spacing="1.5">CERTIFIED SPEED SCORE</text>',
    '<!-- Brand -->',
    '<text x="276" y="73" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="8.5" fill="' + t.brandColor + '" letter-spacing="0.5">TheFastestWeb</text>',
    '</svg>',
  ];
  return lines.filter(Boolean).join("\n");
}

// ─── Variant 3: Score Card (bold number + gradient accent strip) ──────────────

function buildScoreCard(score: number, domain: string, theme: "dark" | "light"): string {
  const isDark = theme === "dark";
  const t = tok(isDark);
  const color = scoreColor(score);
  const dom = clampDomain(domain);
  const fs = domainFontSize(dom.length);
  const sc = scoreDisplay(score);
  const scoreFontSize = score >= 100 ? 30 : 36;

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="288" height="80" role="img" aria-label="Speed score ' + score + '/100 \u2014 TheFastestWeb">',
    '<title>Speed score ' + score + '/100 \u2014 TheFastestWeb</title>',
    '<defs>',
    '<linearGradient id="numG3" x1="0%" y1="0%" x2="0%" y2="100%">',
    '<stop offset="0%" stop-color="' + color + '"/>',
    '<stop offset="100%" stop-color="' + color + 'bb"/>',
    '</linearGradient>',
    '<linearGradient id="stripG3" x1="0%" y1="0%" x2="0%" y2="100%">',
    '<stop offset="0%" stop-color="' + color + '"/>',
    '<stop offset="100%" stop-color="' + color + '88"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="288" height="80" rx="14" fill="' + t.bg + '"/>',
    '<rect width="14" height="80" rx="14" fill="url(#stripG3)"/>',
    '<rect x="5" y="0" width="9" height="80" fill="' + t.bg + '"/>',
    '<rect width="288" height="80" rx="14" fill="none" stroke="' + t.border + '" stroke-width="' + t.borderWidth + '"/>',
    '<text x="55" y="50" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="' + scoreFontSize + '" font-weight="800" fill="url(#numG3)" letter-spacing="-1">' + sc + '</text>',
    '<text x="55" y="64" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="9" fill="' + t.subColor + '">/100</text>',
    '<line x1="101" y1="14" x2="101" y2="66" stroke="' + t.divColor + '" stroke-width="1.2"/>',
    '<text x="115" y="36" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="' + fs + '" font-weight="700" fill="' + t.domColor + '">' + dom + '</text>',
    '<text x="115" y="52" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="9" fill="' + t.subColor + '" letter-spacing="1.5">CERTIFIED SPEED SCORE</text>',
    '<text x="276" y="73" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="8.5" fill="' + t.brandColor + '" letter-spacing="0.5">TheFastestWeb</text>',
    '</svg>',
  ].join("\n");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const previewScore = req.nextUrl.searchParams.get("preview");
  const previewDomain = req.nextUrl.searchParams.get("domain") ?? "";
  const theme = req.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  const variant = req.nextUrl.searchParams.get("variant") ?? "glow";

  const db = getDb();
  let score = 0;
  let domain = "";
  let found = false;

  if (db) {
    const [site] = await db
      .select({ currentScore: sites.currentScore, url: sites.url, name: sites.name })
      .from(sites)
      .where(and(eq(sites.slug, slug), eq(sites.isListed, true)))
      .limit(1);

    if (site) {
      found = true;
      score = site.currentScore;
      try {
        domain = new URL(site.url).hostname.replace("www.", "");
      } catch {
        domain = site.name;
      }
    }
  }

  if (!found && previewScore) {
    const p = parseInt(previewScore, 10);
    if (!isNaN(p) && p >= 0 && p <= 100) score = p;
  }
  if (!domain && previewDomain) domain = previewDomain;
  if (!found && !previewScore) return new NextResponse(null, { status: 404 });

  let svg: string;
  if (variant === "speedometer") svg = buildSpeedometer(score, domain, theme);
  else if (variant === "scorecard") svg = buildScoreCard(score, domain, theme);
  else svg = buildGlow(score, domain, theme);
  if (previewScore) svg = svg.replaceAll("CERTIFIED SPEED SCORE", "PREVIEW — SAMPLE");

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": previewScore || score === 0
        ? "no-store"
        : "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
