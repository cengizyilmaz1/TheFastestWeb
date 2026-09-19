import { z } from "zod";

/** Reserved names document boundaries; only implemented handlers may receive jobs. */
export const QUEUE_NAMES = ["performance", "screenshots", "emails", "notifications", "rankings", "badges", "analytics", "maintenance", "webhooks"] as const;
export type QueueName = typeof QUEUE_NAMES[number];
export const ACTIVE_QUEUES = ["performance", "maintenance"] as const;
export type ActiveQueueName = typeof ACTIVE_QUEUES[number];

export const queueJobSchema = z.discriminatedUnion("queue", [
  z.object({ id: z.uuid(), queue: z.literal("performance"), kind: z.enum(["site.performance.daily", "site.performance.manual"]), correlationId: z.uuid().optional() }).strict(),
  z.object({ id: z.uuid(), queue: z.literal("maintenance"), kind: z.literal("maintenance.cleanup"), correlationId: z.uuid().optional() }).strict(),
]);
export type QueueJob = z.infer<typeof queueJobSchema>;
export type QueuePayload = { jobId: string; correlationId: string };

export function validateQueueJob(input: unknown): QueueJob {
  const parsed = queueJobSchema.safeParse(input);
  if (!parsed.success) throw new Error("Unsupported or invalid background job");
  return parsed.data;
}

export function validateQueuePayload(queue: ActiveQueueName, name: string, data: unknown): QueueJob {
  const payload = z.object({ jobId: z.uuid(), correlationId: z.uuid() }).strict().safeParse(data);
  if (!payload.success) throw new Error("Invalid background job payload");
  return validateQueueJob({ id: payload.data.jobId, queue, kind: name, correlationId: payload.data.correlationId });
}
