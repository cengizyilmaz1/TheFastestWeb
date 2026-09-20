import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { ScreenshotClient, ScreenshotConfig } from "./config";
import { retentionDays } from "./config";
import { captureCacheKey, requestHash, type CaptureResponse, type CaptureResult, type CaptureStatus, type PreparedCapture } from "./contracts";

export class ServiceError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
export type CaptureRow = {
  id: string; client_id: string; request: PreparedCapture; status: CaptureStatus; attempts: number;
  lease_token: string | null; result: CaptureResult | null; error_code: string | null; expires_at: Date;
};
export class ScreenshotRepository {
  readonly sql;
  constructor(private readonly config: ScreenshotConfig) {
    this.sql = postgres(config.SCREENSHOT_DATABASE_URL, { max: 5, connect_timeout: 3, idle_timeout: 20,
      connection: { statement_timeout: 10_000, application_name: "central-screenshot" } });
  }
  async ready() {
    await this.sql`SELECT id,client_id,request,status,lease_token,result FROM screenshot_captures WHERE false`;
    const [row] = await this.sql`SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls AS unsafe FROM pg_roles WHERE rolname=current_user`;
    const [owner] = await this.sql`SELECT has_schema_privilege(current_user,'public','CREATE') OR
      EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND pg_has_role(current_user,datdba,'MEMBER')) OR
      EXISTS(SELECT 1 FROM pg_class WHERE relname IN ('screenshot_captures','screenshot_objects','screenshot_idempotency','screenshot_quotas') AND pg_has_role(current_user,relowner,'MEMBER')) AS unsafe`;
    if (row.unsafe || owner.unsafe) throw new ServiceError("DATABASE_ROLE_UNSAFE", 503);
  }
  async create(client: ScreenshotClient, request: PreparedCapture, key: string): Promise<CaptureResponse> {
    return this.sql.begin(async (tx) => {
      const [clock] = await tx`SELECT now() AS now`;
      const now = new Date(clock.now);
      const cacheKey = captureCacheKey(client.id, request, now), inputHash = requestHash(request);
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${client.id}:${key}`},0))`;
      const [same] = await tx`SELECT request_hash,capture_id FROM screenshot_idempotency WHERE client_id=${client.id} AND key=${key}`;
      if (same) {
        if (same.request_hash !== inputHash) throw new ServiceError("IDEMPOTENCY_CONFLICT", 409);
        const [row] = await tx<CaptureRow[]>`SELECT * FROM screenshot_captures WHERE id=${same.capture_id}`;
        return this.present(row);
      }
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${cacheKey},0))`;
      let [row] = await tx<CaptureRow[]>`SELECT * FROM screenshot_captures WHERE client_id=${client.id} AND cache_key=${cacheKey} AND expires_at>now()
        AND ((status='ready' AND cache_until>now() AND expires_at>now()) OR status IN ('pending','processing')) ORDER BY created_at DESC LIMIT 1`;
      if (!row) {
        const quota = await tx`INSERT INTO screenshot_quotas(client_id,day,used) VALUES(${client.id},(now() AT TIME ZONE 'UTC')::date,1)
          ON CONFLICT(client_id,day) DO UPDATE SET used=screenshot_quotas.used+1 WHERE screenshot_quotas.used<${client.requestsPerDay} RETURNING used`;
        if (!quota.length) throw new ServiceError("DAILY_QUOTA_EXCEEDED", 429);
        const days = retentionDays(this.config, request.history);
        const expires = new Date(now.getTime() + days * 86_400_000);
        const cacheUntil = request.history === "none" ? new Date(Math.min(expires.getTime(), now.getTime() + this.config.SCREENSHOT_CACHE_HOURS * 3600_000)) : expires;
        [row] = await tx<CaptureRow[]>`INSERT INTO screenshot_captures(id,client_id,cache_key,request,expires_at,cache_until)
          VALUES(${randomUUID()},${client.id},${cacheKey},${tx.json(request)},${expires},${cacheUntil}) RETURNING *`;
      }
      await tx`INSERT INTO screenshot_idempotency(client_id,key,request_hash,capture_id) VALUES(${client.id},${key},${inputHash},${row.id})`;
      return this.present(row);
    });
  }
  present(row: CaptureRow): CaptureResponse {
    if (row.expires_at.getTime() <= Date.now()) return { id: row.id, status: "expired" };
    return { id: row.id, status: row.status, ...(row.status === "ready" && row.result ? { result: row.result } : {}),
      ...(row.error_code ? { errorCode: row.error_code } : {}) };
  }
  async find(clientId: string, id: string): Promise<CaptureRow | null> {
    const [row] = await this.sql<CaptureRow[]>`SELECT * FROM screenshot_captures WHERE id=${id} AND client_id=${clientId}`;
    return row ?? null;
  }
  async due(): Promise<{ id: string }[]> {
    return this.sql<{ id: string }[]>`SELECT id FROM screenshot_captures WHERE available_at<=now() AND expires_at>now()
      AND (status='pending' OR (status='processing' AND lease_until<=now())) ORDER BY updated_at LIMIT 100`;
  }
  async claim(id: string): Promise<CaptureRow | null> {
    const [row] = await this.sql<CaptureRow[]>`UPDATE screenshot_captures SET status='processing',attempts=attempts+1,
      lease_token=${randomUUID()},lease_until=now()+interval '90 seconds',updated_at=now()
      WHERE id=${id} AND expires_at>now() AND available_at<=now() AND attempts<3
      AND (status='pending' OR (status='processing' AND lease_until<=now())) RETURNING *`;
    if (!row) await this.sql`UPDATE screenshot_captures SET status='failed',error_code='ATTEMPTS_EXHAUSTED',lease_token=NULL,lease_until=NULL,updated_at=now()
      WHERE id=${id} AND attempts>=3 AND status IN ('pending','processing') AND (lease_until IS NULL OR lease_until<=now())`;
    return row ?? null;
  }
  async complete(row: CaptureRow, result: CaptureResult): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const saved = await tx`UPDATE screenshot_captures SET status='ready',result=${tx.json(result)},error_code=NULL,
        lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=${row.id} AND lease_token=${row.lease_token} AND lease_until>now() AND expires_at>now() RETURNING id`;
      if (!saved.length) return false;
      await tx`UPDATE screenshot_objects SET committed=true WHERE capture_id=${row.id} AND lease_token=${row.lease_token}`;
      return true;
    });
  }
  async stageObjects(row: CaptureRow, objects: { objectKey: string; visibility: "public" | "private" }[]) {
    await this.sql.begin(async (tx) => {
      const owned = await tx`SELECT id FROM screenshot_captures WHERE id=${row.id} AND lease_token=${row.lease_token} AND lease_until>now() AND expires_at>now() FOR UPDATE`;
      if (!owned.length) throw new ServiceError("LEASE_EXPIRED", 409);
      for (const object of objects) await tx`INSERT INTO screenshot_objects(object_key,capture_id,lease_token,visibility)
        VALUES(${object.objectKey},${row.id},${row.lease_token},${object.visibility}) ON CONFLICT DO NOTHING`;
    });
  }
  async objectsToDelete(): Promise<{ object_key: string; visibility: "public" | "private" }[]> {
    return this.sql<{ object_key: string; visibility: "public" | "private" }[]>`SELECT o.object_key,o.visibility FROM screenshot_objects o
      JOIN screenshot_captures c ON c.id=o.capture_id WHERE c.expires_at<=now() OR
      (o.committed=false AND o.created_at<now()-interval '10 minutes' AND (c.lease_token IS DISTINCT FROM o.lease_token OR c.lease_until<=now()))
      ORDER BY o.created_at LIMIT 16`;
  }
  async forgetObject(key: string) { await this.sql`DELETE FROM screenshot_objects WHERE object_key=${key}`; }
  async fail(row: CaptureRow, code: string, permanent = false) {
    await this.sql`UPDATE screenshot_captures SET status=${permanent || row.attempts >= 3 ? "failed" : "pending"},error_code=${code},
      lease_token=NULL,lease_until=NULL,available_at=now()+(${Math.min(30 * 2 ** row.attempts, 600)} * interval '1 second'),updated_at=now()
      WHERE id=${row.id} AND lease_token=${row.lease_token} AND lease_until>now()`;
  }
  async expired(): Promise<CaptureRow[]> {
    return this.sql<CaptureRow[]>`SELECT * FROM screenshot_captures WHERE expires_at<=now() AND status<>'expired'
      AND (status<>'processing' OR lease_until<=now()) ORDER BY expires_at LIMIT 100`;
  }
  async markExpired(id: string) { await this.sql`UPDATE screenshot_captures SET status='expired',updated_at=now() WHERE id=${id} AND expires_at<=now()
    AND NOT EXISTS(SELECT 1 FROM screenshot_objects WHERE capture_id=${id})`; }
  async prune() {
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM screenshot_idempotency WHERE created_at<now()-interval '30 days' AND capture_id IN(SELECT id FROM screenshot_captures WHERE status='expired')`;
      await tx`DELETE FROM screenshot_captures WHERE status='expired' AND updated_at<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM screenshot_idempotency WHERE capture_id=screenshot_captures.id)`;
      await tx`DELETE FROM screenshot_quotas WHERE day<(now() AT TIME ZONE 'UTC')::date-31`;
    });
  }
  async close() { await this.sql.end({ timeout: 5 }); }
}
