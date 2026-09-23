import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { backgroundJobs, jobEvents } from "@/db/schema";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { normalizePublicUrl } from "@/lib/security/public-url";
import { allowsPublicScreenshot } from "./policy";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type PublishedSite = { id: string; url: string; isListed: boolean; lifecycle: string; archivedAt: Date | null };

/** Publication and its initial capture commit together; no provider work here. */
export async function enqueueInitialScreenshot(tx: Transaction, site: PublishedSite,
  options: { availableAt?: Date; actor?: "service" | "operator" } = {}): Promise<boolean> {
  if (!getEnv().SCREENSHOTS_ENABLED || !site.isListed || !allowsPublicScreenshot(site.lifecycle) || site.archivedAt) return false;
  return enqueueCapture(tx, site, `screenshot:${site.id}:initial`, options);
}

async function enqueueCapture(tx: Transaction, site: Pick<PublishedSite, "id" | "url">, jobKey: string,
  options: { availableAt?: Date; actor?: "service" | "operator" } = {}): Promise<boolean> {
  const [capture] = await tx.insert(backgroundJobs).values({ siteId: site.id, queue: "screenshots", kind: "site.screenshot.capture",
    jobKey, payload: { siteId: site.id, sourceUrl: normalizePublicUrl(site.url),
      device: "desktop", mode: "viewport", history: "daily" }, correlationId: randomUUID(), maxAttempts: getEnv().JOB_MAX_ATTEMPTS,
    ...(options.availableAt ? { availableAt: options.availableAt } : {}),
  }).onConflictDoNothing({ target: backgroundJobs.jobKey }).returning({ id: backgroundJobs.id });
  if (!capture) return false;
  await tx.insert(jobEvents).values({ jobId: capture.id, event: "scheduled", actor: options.actor ?? "service", attempt: 0 });
  return true;
}

const missingInitial = () => sql`s.is_listed AND s.lifecycle IN ('active','verified') AND s.archived_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM site_screenshots p WHERE p.site_id=s.id AND p.status='ready' AND p.retention_until>now())
  AND NOT EXISTS (SELECT 1 FROM background_jobs j WHERE j.site_id=s.id
    AND (j.job_key='screenshot:'||s.id::text||':initial' OR (j.queue='screenshots' AND j.status IN ('pending','queued','running'))))`;

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Screenshot operations are unavailable.", 503);
  return db;
}

export async function previewInitialScreenshots() {
  const [row] = await database().execute<{ eligible: number }>(sql`SELECT count(*)::integer AS eligible FROM sites s WHERE ${missingInitial()}`);
  return { enabled: getEnv().SCREENSHOTS_ENABLED, eligible: row.eligible, batchLimit: 25, spacingSeconds: 10 };
}

/** Explicit, bounded operator backfill through the ordinary durable job path. */
export async function backfillInitialScreenshots(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new AppError("INVALID_REQUEST", "Choose a screenshot batch size from 1 to 25.", 400);
  if (!getEnv().SCREENSHOTS_ENABLED) throw new AppError("FEATURE_DISABLED", "Screenshots are not enabled.", 503);
  return database().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('screenshot-capture-batches',0))`);
    const rows = await tx.execute<{ id: string; url: string }>(sql`SELECT s.id,s.url FROM sites s WHERE ${missingInitial()}
      ORDER BY s.id LIMIT ${limit} FOR UPDATE OF s SKIP LOCKED`);
    const start = await nextBatchStart(tx);
    let scheduled = 0, skippedInvalid = 0;
    for (const row of rows) {
      // Historical imported URLs may no longer meet the current public URL policy.
      // Leave them untouched and report only an aggregate; never weaken that policy.
      try { normalizePublicUrl(row.url); } catch { skippedInvalid++; continue; }
      const inserted = await enqueueInitialScreenshot(tx, { ...row, isListed: true, lifecycle: "active", archivedAt: null },
        { actor: "operator", availableAt: new Date(start + (scheduled + 1) * 10_000) });
      if (inserted) scheduled++;
    }
    return { scheduled, skippedInvalid, batchLimit: limit, spacingSeconds: 10 };
  });
}

async function nextBatchStart(tx: Transaction) {
  const [clock] = await tx.execute<{ start_ms: string }>(sql`SELECT extract(epoch FROM greatest(now(),
    coalesce((SELECT max(available_at) FROM background_jobs WHERE queue='screenshots' AND status IN ('pending','queued','running')),now()))) * 1000 AS start_ms`);
  return Number(clock.start_ms);
}

// This cursor only rotates bounded inspection work. Authorization and deduplication
// remain transactional, so a restart or multiple scheduler replicas are harmless.
let refreshScanCursor = "00000000-0000-0000-0000-000000000000";

/** Renew established previews before expiry or when their source URL changes. */
export async function enqueueExpiringScreenshots(tx: Transaction, day: string): Promise<number> {
  if (!getEnv().SCREENSHOTS_ENABLED) return 0;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('screenshot-capture-batches',0))`);
  const rows = await tx.execute<{ id: string; url: string }>(sql`SELECT s.id,s.url FROM sites s
    WHERE s.is_listed AND s.lifecycle IN ('active','verified') AND s.archived_at IS NULL
      AND EXISTS(SELECT 1 FROM site_screenshots p WHERE p.site_id=s.id AND p.status='ready' AND p.device='desktop' AND p.mode='viewport')
      AND NOT EXISTS(SELECT 1 FROM site_screenshots p WHERE p.site_id=s.id AND p.status='ready'
        AND p.device='desktop' AND p.mode='viewport' AND p.source_url=s.url AND p.retention_until>now()+interval '1 day')
      AND NOT EXISTS(SELECT 1 FROM background_jobs j WHERE j.site_id=s.id
        AND (j.job_key='screenshot:'||s.id::text||':refresh:'||${day}
          OR (j.queue='screenshots' AND j.status IN ('pending','queued','running'))))
    ORDER BY (s.id>${refreshScanCursor}::uuid) DESC,s.id LIMIT 100 FOR UPDATE OF s SKIP LOCKED`);
  if (!rows.length) return 0;
  const normalized = new Map<string, string>();
  for (const site of rows) {
    try { normalized.set(site.id, normalizePublicUrl(site.url)); } catch { /* Invalid imports are not capture targets. */ }
  }
  if (!normalized.size) { refreshScanCursor = rows[rows.length - 1].id; return 0; }
  // Compare all normalized targets in one query, including legacy root slash and
  // tracking variations, rather than one database round trip per candidate.
  const fresh = await tx.execute<{ id: string }>(sql`SELECT target.id FROM (VALUES
    ${sql.join([...normalized].map(([id, source]) => sql`(${id}::uuid,${source}::text)`), sql`,`)}) AS target(id,source)
    WHERE EXISTS(SELECT 1 FROM site_screenshots p WHERE p.site_id=target.id
      AND p.status='ready' AND p.device='desktop' AND p.mode='viewport'
      AND p.source_url=target.source AND p.retention_until>now()+interval '1 day')`);
  const freshIds = new Set(fresh.map((site) => site.id));
  if (freshIds.size === normalized.size) { refreshScanCursor = rows[rows.length - 1].id; return 0; }
  const start = await nextBatchStart(tx);
  let scheduled = 0;
  for (const site of rows) {
    refreshScanCursor = site.id;
    if (!normalized.has(site.id) || freshIds.has(site.id)) continue;
    if (await enqueueCapture(tx, site, `screenshot:${site.id}:refresh:${day}`,
      { availableAt: new Date(start + (scheduled + 1) * 10_000) })) scheduled++;
    if (scheduled === 25) break;
  }
  return scheduled;
}
