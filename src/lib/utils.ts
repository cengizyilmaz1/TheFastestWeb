export function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return "";
  }
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "text-green";
  if (score >= 50) return "text-accent-bright";
  return "text-red";
}

export function getScoreClass(score: number): string {
  if (score >= 97) return "text-green";
  if (score >= 94) return "text-accent-bright";
  return "text-orange";
}

export function getTrendClass(trend: number): string {
  return trend >= 0 ? "text-green" : "text-red";
}

export function metricRating(
  label: string,
  value: string
): "good" | "ok" | "poor" {
  const num = parseFloat(value);
  if (label === "CLS")
    return num <= 0.005 ? "good" : num <= 0.01 ? "ok" : "poor";
  if (label === "TBT")
    return parseInt(value) <= 20 ? "good" : parseInt(value) <= 50 ? "ok" : "poor";
  return num <= 1.0 ? "good" : num <= 2.0 ? "ok" : "poor";
}

/**
 * Check if a URL has a valid domain with a TLD (e.g. example.com).
 * Rejects random strings like "asdfgh" even after https:// is prepended.
 */
export function isValidUrl(input: string): boolean {
  let urlStr = input.trim();
  if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
    urlStr = "https://" + urlStr;
  }
  try {
    const parsed = new URL(urlStr);
    // Must have a dot in hostname (i.e. a TLD) and no spaces
    if (!parsed.hostname.includes(".")) return false;
    // TLD must be at least 2 chars
    const parts = parsed.hostname.split(".");
    const tld = parts[parts.length - 1];
    if (tld.length < 2) return false;
    // No spaces or invalid chars in hostname
    if (/\s/.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// Letters that Unicode decomposition leaves intact. Everything else with a diacritic folds through NFKD.
const SLUG_LETTERS: Record<string, string> = { "ı": "i", "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "đ": "d", "ð": "d", "ł": "l", "þ": "th" };

/** URL slug for a name. Accented and Turkish letters transliterate ("Çilingir" gives "cilingir") instead of being dropped. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ıßæœøđðłþ]/g, (letter) => SLUG_LETTERS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function generateSVGPath(
  points: number[],
  width: number,
  height: number
): { line: string; area: string } {
  const margin = 10;
  const min = Math.min(...points) - 5;
  const max = Math.max(...points) + 5;
  const stepX = (width - margin * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: margin + i * stepX,
    y:
      height - margin - ((p - min) / (max - min)) * (height - margin * 2),
  }));

  let line = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const cx = (coords[i - 1].x + coords[i].x) / 2;
    line += ` C ${cx} ${coords[i - 1].y}, ${cx} ${coords[i].y}, ${coords[i].x} ${coords[i].y}`;
  }

  const area =
    line +
    ` L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;
  return { line, area };
}
