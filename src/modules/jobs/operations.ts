import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { PERFORMANCE_METHOD_VERSION } from "@/modules/performance/service";

/** Private aggregate diagnostics. No site URLs, payloads or account data. */
export async function readJobOperations() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Database is unavailable.", 503);
  const [ledger, coverage, usage, emailDeliveries] = await Promise.all([
    db.execute(sql`SELECT queue,status,count(*)::integer AS count,
      count(*) FILTER(WHERE status='pending' AND attempts>0)::integer AS retrying,
      count(*) FILTER(WHERE status='pending' AND available_at>now())::integer AS delayed,
      count(*) FILTER(WHERE status='failed')::integer AS dead_letter,
      count(*) FILTER(WHERE status IN ('pending','queued') AND available_at<=now())::integer AS due,
      count(*) FILTER(WHERE status='running' AND leased_until<=now())::integer AS expired_leases,
      min(available_at) FILTER(WHERE status IN ('pending','queued') AND available_at<=now()) AS oldest_due_at,
      max(finished_at) FILTER(WHERE status='succeeded') AS last_succeeded_at
      FROM background_jobs GROUP BY queue,status ORDER BY queue,status`),
    db.execute(sql`WITH eligible AS (
      SELECT id FROM sites WHERE is_listed AND NOT monitoring_paused AND lifecycle='active' AND archived_at IS NULL
    ), measured AS (
      SELECT DISTINCT t.site_id,t.strategy FROM speed_tests t JOIN eligible s ON s.id=t.site_id
      WHERE t.methodology_version=${PERFORMANCE_METHOD_VERSION} AND t.sample_count>=2 AND t.metrics_source='lab'
        AND t.tested_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ) SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') AS day,
      (SELECT count(*)::integer FROM eligible) AS eligible_sites,
      count(*) FILTER(WHERE strategy='mobile')::integer AS mobile_measured,
      count(*) FILTER(WHERE strategy='desktop')::integer AS desktop_measured FROM measured`),
    db.execute(sql`SELECT provider,used FROM provider_usage WHERE day=(now() AT TIME ZONE 'UTC')::date ORDER BY provider`),
    db.execute(sql`SELECT status,last_error_code,count(*)::integer AS count,
      min(created_at) FILTER(WHERE status IN ('pending','sending','uncertain','failed')) AS oldest_unresolved_at,
      max(accepted_at) AS last_accepted_at
      FROM email_deliveries GROUP BY status,last_error_code ORDER BY status,last_error_code`),
  ]);
  return { ledger, daily: coverage[0], providerUsage: usage, emailDeliveries, policy: {
    psiRequestsPerDay: getEnv().PSI_REQUESTS_PER_DAY,
  } };
}
