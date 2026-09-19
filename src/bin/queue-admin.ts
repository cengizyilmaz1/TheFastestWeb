import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { validateRuntimeEnv } from "@/config/env";
import { getDb, closeDb } from "@/db";
import { backgroundJobs, jobEvents } from "@/db/schema";
import { closeQueues, readQueueCounts } from "@/infrastructure/queue/queues";
import { operateJob, publicJob } from "@/modules/jobs/service";
import { AppError } from "@/lib/http/errors";

/** Private operator command. There is deliberately no public admin HTTP endpoint. */
async function main() {
  validateRuntimeEnv("worker");
  const [command = "status", id, ...extra] = process.argv.slice(2);
  if (extra.length || !["status", "inspect", "retry", "requeue", "cancel"].includes(command) ||
    (command !== "status" && !z.uuid().safeParse(id).success) || (command === "status" && id)) {
    throw new AppError("INVALID_REQUEST", "Usage: queue-admin status | inspect UUID | retry UUID | requeue UUID | cancel UUID", 400);
  }
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Database is unavailable.", 503);
  if (command === "status") {
    const ledger = await db.execute(sql`SELECT queue,status,count(*)::integer AS count,
      count(*) FILTER(WHERE status='pending' AND attempts>0)::integer AS retrying,
      count(*) FILTER(WHERE status='pending' AND available_at>now())::integer AS delayed,
      count(*) FILTER(WHERE status='failed')::integer AS dead_letter
      FROM background_jobs GROUP BY queue,status ORDER BY queue,status`);
    let transport: unknown;
    try { transport = await readQueueCounts(); }
    catch { transport = { errorCode: "SERVICE_UNAVAILABLE" }; }
    process.stdout.write(JSON.stringify({ ledger, transport }) + "\n");
  } else if (command === "inspect") {
    const [job] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id));
    if (!job) throw new AppError("NOT_FOUND", "Job not found.", 404);
    const events = await db.select({ event: jobEvents.event, actor: jobEvents.actor, attempt: jobEvents.attempt,
      errorCode: jobEvents.errorCode, at: jobEvents.createdAt }).from(jobEvents).where(eq(jobEvents.jobId, id))
      .orderBy(desc(jobEvents.createdAt)).limit(100);
    process.stdout.write(JSON.stringify({ job: { ...publicJob(job), queue: job.queue, siteId: job.siteId, correlationId: job.correlationId }, events }) + "\n");
  } else {
    process.stdout.write(JSON.stringify({ job: publicJob(await operateJob(id, command === "cancel" ? "cancel" : "retry")) }) + "\n");
  }
}

main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ errorCode: error instanceof AppError ? error.code : "OPERATOR_COMMAND_FAILED",
    message: error instanceof AppError ? error.message : "The command failed. Check runtime configuration and dependency health." }) + "\n");
  process.exitCode = 1;
}).finally(async () => { await closeQueues(); await closeDb(); });
