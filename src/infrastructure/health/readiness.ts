import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { AppError } from "@/lib/http/errors";
import { readRedisHealth } from "@/infrastructure/queue/redis";

export async function checkDatabaseReadiness(): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const db = getDb();
    if (!db) throw new Error("Database not configured");
    await Promise.race([
      (async () => {
        // Parsing verifies both migrations and SELECT grants without reading rows.
        await db.execute(sql`
          select s.normalized_url, v.id, r.key, j.id, j.job_key, j.status,
            j.lease_token, e.job_id, t.background_job_id, t.sample_count, t.metrics_source, u.day, u.provider, u.used,
            s.lifecycle, s.country_code, s.badge_status, p.provider_product_id, co.product_snapshot,
            pl.provider_payment_id, pe.provider_event_id, sub.provider_subscription_id,
            en.source_id, en.ad_slot_id, np.marketing, n.event_key, mail.status,
            c.code, cat.slug, sc.is_primary, tech.slug, st.source, f.visibility, fs.founder_id,
            fl.platform, sl.platform, claim.token_hash, period.ranking_algorithm_version,
            ranking.strategy, award.event_key, achievement.key, shot.service_job_id,
            admin.role, audit.reason
          from public.sites s
          cross join public.verified_speed_tests v
          cross join public.request_rate_limits r
          cross join public.background_jobs j
          cross join public.job_events e
          cross join public.speed_tests t
          cross join public.provider_usage u
          cross join public.products p
          cross join public.checkout_orders co
          cross join public.payment_ledger pl
          cross join public.payment_events pe
          cross join public.subscriptions sub
          cross join public.entitlements en
          cross join public.notification_preferences np
          cross join public.notifications n
          cross join public.email_deliveries mail
          cross join public.countries c
          cross join public.categories cat
          cross join public.site_categories sc
          cross join public.technologies tech
          cross join public.site_technologies st
          cross join public.founders f
          cross join public.founder_sites fs
          cross join public.founder_social_links fl
          cross join public.site_social_links sl
          cross join public.site_claims claim
          cross join public.competition_periods period
          cross join public.ranking_snapshots ranking
          cross join public.site_awards award
          cross join public.achievements achievement
          cross join public.site_screenshots shot
          cross join public.admin_roles admin
          cross join public.audit_logs audit
          where false
        `);
        const [role] = await db.execute(sql`
          select (
            rolsuper or rolcreatedb or rolcreaterole or rolbypassrls or rolreplication
            or pg_has_role(current_user, (
              select datdba from pg_database where datname = current_database()
            ), 'USAGE')
            or has_schema_privilege(current_user, 'public', 'CREATE')
            or exists (
              select 1 from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind in ('r', 'p')
                and pg_has_role(current_user, c.relowner, 'USAGE')
            )
            or not has_table_privilege(current_user, 'public.background_jobs', 'INSERT')
            or not has_table_privilege(current_user, 'public.background_jobs', 'UPDATE')
            or not has_table_privilege(current_user, 'public.job_events', 'INSERT')
            or not has_table_privilege(current_user, 'public.provider_usage', 'INSERT')
            or not has_table_privilege(current_user, 'public.provider_usage', 'UPDATE')
            or exists (
              select 1 from unnest(array[
                'products','checkout_orders','payment_ledger','payment_events','subscriptions',
                'entitlements','notification_preferences','notifications','email_deliveries',
                'categories','site_categories','technologies','site_technologies','founders','founder_sites',
                'founder_social_links','site_social_links','site_claims','competition_periods','achievements',
                'site_awards','site_screenshots','admin_roles'
              ]) as required(table_name)
              where not has_table_privilege(current_user, 'public.' || table_name, 'INSERT')
                or not has_table_privilege(current_user, 'public.' || table_name, 'UPDATE')
            )
            -- Immutable history requires append/read, never UPDATE/DELETE permissions.
            or not has_table_privilege(current_user, 'public.ranking_snapshots', 'INSERT')
            or not has_table_privilege(current_user, 'public.audit_logs', 'INSERT')
            or (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
                join pg_namespace n on n.oid=c.relnamespace
                join pg_proc p on p.oid=t.tgfoid
                where n.nspname='public' and not t.tgisinternal and t.tgenabled in ('O','A')
                  and ((c.relname='ranking_snapshots' and t.tgname='ranking_snapshots_immutable'
                        and t.tgtype=31 and p.proname='guard_ranking_snapshot')
                    or (c.relname='competition_periods' and t.tgname='competition_periods_immutable'
                        and t.tgtype=27 and p.proname='guard_competition_period'))) <> 2
          ) as unsafe
          from pg_roles where rolname = current_user
        `);
        if (!role || role.unsafe !== false) throw new Error("Unsafe application role");
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Readiness timeout")), 3000);
      }),
    ]);
  } catch {
    throw new AppError("DATABASE_UNAVAILABLE", "Database is unavailable.", 503);
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkReadiness(): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.all([
    checkDatabaseReadiness(),
    readRedisHealth().then((health) => {
      if (!health.ready) throw new Error("Redis readiness failed");
    }).catch(() => {
      throw new AppError("SERVICE_UNAVAILABLE", "Queue service is unavailable.", 503);
    }),
    ]), new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new AppError("SERVICE_UNAVAILABLE", "Service is unavailable.", 503)), 3000);
    })]);
  } finally { clearTimeout(timeout); }
}
