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
            j.lease_token, e.job_id, t.background_job_id, u.day, u.provider, u.used
          from public.sites s
          cross join public.verified_speed_tests v
          cross join public.request_rate_limits r
          cross join public.background_jobs j
          cross join public.job_events e
          cross join public.speed_tests t
          cross join public.provider_usage u
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
