import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { backgroundJobs, emailDeliveries, jobEvents, notificationPreferences, notifications, users } from "@/db/schema";
import { getEnv } from "@/config/env";
import { graphMail, isEmailEnabled, MailDeliveryError } from "@/infrastructure/email/graph";
import { getCorrelationId } from "@/lib/http/correlation";
import { AppError } from "@/lib/http/errors";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";
import { notificationTemplates, renderNotification, templateSchema, variablesSchema, type NotificationTemplate, type NotificationVariables } from "./templates";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const defaults = { marketing: false, performance: true, weekly: true, badge: true };
function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Notifications are temporarily unavailable.", 503);
  return db;
}
export async function getNotificationPreferences(userId: string) {
  const [row] = await database().select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  return row ? { marketing: row.marketing, performance: row.performance, weekly: row.weekly, badge: row.badge } : { ...defaults };
}
export async function updateNotificationPreferences(userId: string, preferences: Partial<typeof defaults>) {
  await database().insert(notificationPreferences).values({ userId, ...preferences })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...preferences, updatedAt: sql`now()` } });
  return getNotificationPreferences(userId);
}
export async function unsubscribe(token: string) {
  const { userId, category } = verifyUnsubscribeToken(token);
  await updateNotificationPreferences(userId, { [category]: false });
  return { category };
}

/** May join a domain transaction, so notifications cannot outlive a rolled-back change. */
export async function enqueueNotification(input: { userId: string; eventKey: string; type: NotificationTemplate; variables: NotificationVariables }, transaction?: Transaction) {
  if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(input.eventKey)) throw new AppError("INVALID_REQUEST", "Invalid notification event.", 400);
  const type = templateSchema.parse(input.type), variables = variablesSchema.parse(input.variables);
  const persist = async (tx: Transaction) => {
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, input.userId));
    if (!user) return { notificationId: null, deliveryId: null };
    const [notification] = await tx.insert(notifications).values({ userId: input.userId, eventKey: input.eventKey, type, payload: variables })
      .onConflictDoNothing({ target: notifications.eventKey }).returning();
    if (!notification) return { notificationId: null, deliveryId: null };
    // Disabled integrations still retain the in-app notification; no accidental
    // backlog of historical mail is sent when credentials are enabled later.
    if (!isEmailEnabled()) return { notificationId: notification.id, deliveryId: null };
    const [delivery] = await tx.insert(emailDeliveries).values({ userId: input.userId, notificationId: notification.id,
      eventKey: input.eventKey, template: type, recipient: user.email }).returning();
    const [job] = await tx.insert(backgroundJobs).values({ queue: "emails", kind: "email.deliver", jobKey: `email:${delivery.id}`,
      payload: { deliveryId: delivery.id }, maxAttempts: getEnv().JOB_MAX_ATTEMPTS, correlationId: getCorrelationId() ?? randomUUID() }).returning();
    await tx.insert(jobEvents).values({ jobId: job.id, event: "scheduled", actor: "notifications", attempt: 0 });
    return { notificationId: notification.id, deliveryId: delivery.id };
  };
  return transaction ? persist(transaction) : database().transaction(persist);
}

export async function deliverNotificationEmail(deliveryId: string): Promise<{ status: "accepted" | "suppressed" }> {
  if (!isEmailEnabled()) throw new AppError("FEATURE_DISABLED", "Email delivery is not enabled.", 503);
  const db = database();
  const prepared = await db.transaction(async (tx) => {
    const [delivery] = await tx.select().from(emailDeliveries).where(eq(emailDeliveries.id, deliveryId)).for("update");
    if (!delivery) throw new MailDeliveryError("REJECTED", false);
    if (delivery.status === "accepted" || delivery.status === "suppressed") return { complete: delivery.status };
    if (["uncertain", "failed"].includes(delivery.status)) throw new MailDeliveryError("UNCERTAIN", false);
    if (delivery.status === "sending") {
      if (delivery.updatedAt.getTime() > Date.now() - 60_000) throw new MailDeliveryError("RATE_LIMITED", true);
      await tx.update(emailDeliveries).set({ status: "uncertain", lastErrorCode: "UNCERTAIN", updatedAt: sql`now()` }).where(eq(emailDeliveries.id, deliveryId));
      return { uncertain: true };
    }
    const type = templateSchema.safeParse(delivery.template);
    const [notification] = delivery.notificationId ? await tx.select().from(notifications).where(eq(notifications.id, delivery.notificationId)) : [];
    const [user] = delivery.userId ? await tx.select({ email: users.email }).from(users).where(eq(users.id, delivery.userId)) : [];
    const [preferences] = delivery.userId ? await tx.select().from(notificationPreferences).where(eq(notificationPreferences.userId, delivery.userId)) : [];
    const category = type.success ? notificationTemplates[type.data].category : null;
    const allowed = category === "transactional" || (category && (preferences ?? defaults)[category]);
    if (!type.success || !notification || !user || user.email !== delivery.recipient || !allowed) {
      await tx.update(emailDeliveries).set({ status: "suppressed", updatedAt: sql`now()` }).where(eq(emailDeliveries.id, deliveryId));
      return { complete: "suppressed" as const };
    }
    const variables = variablesSchema.safeParse(notification.payload);
    if (!variables.success) throw new MailDeliveryError("REJECTED", false);
    const unsubscribeUrl = category !== "transactional" && category && delivery.userId
      ? `${getEnv().SITE_URL}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(delivery.userId, category))}` : undefined;
    const rendered = renderNotification(type.data, variables.data, unsubscribeUrl);
    await tx.update(emailDeliveries).set({ status: "sending", attempts: delivery.attempts + 1, updatedAt: sql`now()` }).where(eq(emailDeliveries.id, deliveryId));
    return { message: { ...rendered, to: delivery.recipient } };
  });
  if (prepared.complete) return { status: prepared.complete };
  if (prepared.uncertain || !prepared.message) throw new MailDeliveryError("UNCERTAIN", false);
  try { await graphMail.send(prepared.message); }
  catch (error) {
    const failure = error instanceof MailDeliveryError ? error : new MailDeliveryError("UNCERTAIN", false);
    await db.update(emailDeliveries).set({ status: failure.retryable ? "pending" : failure.deliveryCode === "UNCERTAIN" ? "uncertain" : "failed",
      lastErrorCode: failure.deliveryCode, updatedAt: sql`now()` }).where(and(eq(emailDeliveries.id, deliveryId), eq(emailDeliveries.status, "sending")));
    throw failure;
  }
  // A DB failure here deliberately leaves sending/uncertain instead of re-sending.
  await db.update(emailDeliveries).set({ status: "accepted", acceptedAt: sql`now()`, lastErrorCode: null, updatedAt: sql`now()` })
    .where(and(eq(emailDeliveries.id, deliveryId), eq(emailDeliveries.status, "sending")));
  return { status: "accepted" };
}
