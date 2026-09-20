import { sql } from "drizzle-orm";
import { getEnv } from "@/config/env";
import { getDb, type Database } from "@/db";
import { isCanonicalCrawlerRequest } from "@/infrastructure/analytics/datafast-crawlers";
import { readAnalyticsConsent } from "@/infrastructure/analytics/consent";
import { logger } from "@/infrastructure/logging/logger";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type RedirectTarget = { kind: "managed"; ruleId: string }
  | { kind: "founder"; founderId: string; sourcePath: string };
export type RedirectObservation = { target: RedirectTarget; classification: "human" | "bot"; observedAt: Date };
export type RedirectStatistics = {
  total: number; human: number; bot: number; today: number; last30Days: number; lastSeenAt: string | null;
};
export type RedirectDayStatistics = { date: string; total: number; human: number; bot: number };

/** Classification is a heuristic, not evidence of unique people or genuine clicks. */
export function classifyRedirectRequest(request: Request): "human" | "bot" | null {
  const headers = request.headers;
  if (request.method !== "GET" || readAnalyticsConsent(headers.get("cookie") ?? "", { dnt: headers.get("dnt"), gpc: headers.get("sec-gpc") === "1" }) === "denied"
    || headers.has("rsc") || headers.has("next-router-prefetch") || headers.has("next-router-segment-prefetch")
    || /prefetch|prerender/i.test(`${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`)) return null;
  const destination = headers.get("sec-fetch-dest");
  if (destination && destination !== "document") return null;
  const agent = headers.get("user-agent") ?? "";
  if (!agent || agent.length > 1024 || /bot|crawler|spider|headless|lighthouse|preview|slurp|facebookexternalhit|curl\/|wget\/|python|httpclient|http-client|go-http|node|axios|postman|monitor|uptime|synthetic/i.test(agent)) return "bot";
  return "human";
}

/** Sanitize before deferring work: retain no Request, cookies, IP, query, referrer or user agent. */
export function prepareRedirectObservation(request: Request, target: RedirectTarget): RedirectObservation | null {
  try {
    const classification = classifyRedirectRequest(request), env = getEnv();
    // Local operational counters are independent of third-party analytics switches.
    if (!classification || !isCanonicalCrawlerRequest(request, env.SITE_URL)) return null;
    if (target.kind === "founder" && target.sourcePath !== "/profile/[account-id]"
      && (!/^\/founders?\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.sourcePath) || target.sourcePath.split("/")[2].length > 80)) return null;
    return { target, classification, observedAt: new Date() };
  } catch { return null; }
}

/** Atomic counters; measurement failure never changes the redirect response. */
export async function recordRedirectObservation(observation: RedirectObservation): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    const { target, classification, observedAt } = observation;
    const day = observedAt.toISOString().slice(0, 10), instant = observedAt.toISOString();
    const human = classification === "human" ? 1 : 0, bot = classification === "bot" ? 1 : 0;
    if (target.kind === "managed") {
      await db.execute(sql`INSERT INTO public.redirect_rule_daily_stats(rule_id,day,human_requests,bot_requests,last_seen_at)
        SELECT id,${day}::date,${human},${bot},${instant}::timestamptz FROM public.redirect_rules WHERE id=${target.ruleId}::uuid
        ON CONFLICT(rule_id,day) DO UPDATE SET human_requests=redirect_rule_daily_stats.human_requests+EXCLUDED.human_requests,
          bot_requests=redirect_rule_daily_stats.bot_requests+EXCLUDED.bot_requests,
          last_seen_at=GREATEST(redirect_rule_daily_stats.last_seen_at,EXCLUDED.last_seen_at)`);
    } else {
      const sourceType = target.sourcePath === "/profile/[account-id]" ? "legacy" : "alias";
      // Recheck publication at write time; owner-only redirects never enter analytics.
      // Alias membership also prevents arbitrary path cardinality from supplied URLs.
      const slug = sourceType === "alias" ? target.sourcePath.split("/")[2] : "";
      await db.execute(sql`INSERT INTO public.founder_redirect_daily_stats(founder_id,source_type,source_path,day,human_requests,bot_requests,last_seen_at)
        SELECT f.id,${sourceType},${target.sourcePath},${day}::date,${human},${bot},${instant}::timestamptz
        FROM public.founders f WHERE f.id=${target.founderId}::uuid AND f.visibility='public'
          AND (${sourceType}='legacy' OR f.slug=${slug} OR EXISTS (
            SELECT 1 FROM public.founder_slug_aliases a WHERE a.founder_id=f.id AND a.slug=${slug}))
        ON CONFLICT(founder_id,source_type,source_path,day) DO UPDATE SET human_requests=founder_redirect_daily_stats.human_requests+EXCLUDED.human_requests,
          bot_requests=founder_redirect_daily_stats.bot_requests+EXCLUDED.bot_requests,
          last_seen_at=GREATEST(founder_redirect_daily_stats.last_seen_at,EXCLUDED.last_seen_at)`);
    }
  } catch { logger.warn({ event: "redirect.statistics_failed", code: "COUNTER_UNAVAILABLE" }); }
}

export function recordRedirectInBackground(request: Request, target: RedirectTarget, context: { waitUntil: (promise: Promise<unknown>) => void }): void {
  const observation = prepareRedirectObservation(request, target);
  if (!observation) return;
  try { context.waitUntil(recordRedirectObservation(observation)); } catch { /* The redirect is authoritative. */ }
}

export const emptyRedirectStatistics = (): RedirectStatistics => ({ total: 0, human: 0, bot: 0, today: 0, last30Days: 0, lastSeenAt: null });

/** Caller must already hold an administrator grant in this transaction. */
export async function readRedirectStatistics(tx: Tx, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const firstDay = new Date(Date.parse(today) - 29 * 86_400_000).toISOString().slice(0, 10);
  const counters = sql`SELECT 'managed'::text AS kind,s.rule_id AS subject_id,''::text AS source_type,''::text AS source_path,
      ''::text AS username,s.day,s.human_requests,s.bot_requests,s.last_seen_at FROM public.redirect_rule_daily_stats s
    UNION ALL SELECT 'founder',s.founder_id,s.source_type,s.source_path,f.slug,s.day,s.human_requests,s.bot_requests,s.last_seen_at
      FROM public.founder_redirect_daily_stats s INNER JOIN public.founders f ON f.id=s.founder_id WHERE f.visibility='public'`;
  const aggregated = await tx.execute(sql`WITH counters AS (${counters})
    SELECT kind,subject_id,source_type,source_path,username,
      sum(human_requests) AS human,sum(bot_requests) AS bot,
      coalesce(sum(human_requests+bot_requests) FILTER(WHERE day=${today}::date),0) AS today,
      coalesce(sum(human_requests+bot_requests) FILTER(WHERE day BETWEEN ${firstDay}::date AND ${today}::date),0) AS last_30_days,
      max(last_seen_at) AS last_seen_at
    FROM counters GROUP BY kind,subject_id,source_type,source_path,username ORDER BY kind,subject_id,source_path`);
  const dayRows = await tx.execute(sql`WITH counters AS (${counters})
    SELECT day::text AS day,sum(human_requests) AS human,sum(bot_requests) AS bot FROM counters
    WHERE day BETWEEN ${firstDay}::date AND ${today}::date GROUP BY day ORDER BY day`);
  const statistics = emptyRedirectStatistics();
  const rules: Record<string, RedirectStatistics> = {};
  const founderStatistics: { founderId: string; username: string; sourceType: "alias" | "legacy"; sourcePath: string; statistics: RedirectStatistics }[] = [];
  for (const row of aggregated) {
    const human = Number(row.human), bot = Number(row.bot);
    const stats: RedirectStatistics = { human, bot, total: human + bot, today: Number(row.today), last30Days: Number(row.last_30_days),
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at as string | Date).toISOString() : null };
    statistics.human += human; statistics.bot += bot; statistics.total += stats.total;
    statistics.today += stats.today; statistics.last30Days += stats.last30Days;
    if (stats.lastSeenAt && (!statistics.lastSeenAt || stats.lastSeenAt > statistics.lastSeenAt)) statistics.lastSeenAt = stats.lastSeenAt;
    if (row.kind === "managed") rules[String(row.subject_id)] = stats;
    else founderStatistics.push({ founderId: String(row.subject_id), username: String(row.username), sourceType: row.source_type as "alias" | "legacy", sourcePath: String(row.source_path), statistics: stats });
  }
  founderStatistics.sort((a, b) => b.statistics.total - a.statistics.total || a.sourcePath.localeCompare(b.sourcePath));
  const days = new Map(dayRows.map(row => [String(row.day), { human: Number(row.human), bot: Number(row.bot) }]));
  const daily: RedirectDayStatistics[] = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.parse(firstDay) + i * 86_400_000).toISOString().slice(0, 10);
    const counts = days.get(date) ?? { human: 0, bot: 0 };
    return { date, ...counts, total: counts.human + counts.bot };
  });
  return { rules, founderStatistics, statistics: { ...statistics, daily } };
}
