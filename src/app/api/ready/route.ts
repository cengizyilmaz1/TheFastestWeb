import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { isShuttingDown } from "@/config/lifecycle";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  if (isShuttingDown()) throw new AppError("SERVICE_UNAVAILABLE", "Service is stopping.", 503);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Database is unavailable.", 503);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        // Parsing a zero-row query verifies M1 schema and application grants.
        await db.execute(sql`
          select s.normalized_url, v.id, r.key
          from public.sites s
          cross join public.verified_speed_tests v
          cross join public.request_rate_limits r
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
  return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
});
