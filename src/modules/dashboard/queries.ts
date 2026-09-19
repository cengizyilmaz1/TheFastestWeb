import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adInventory, adReservations, achievements, checkoutOrders, competitionPeriods, entitlements, notifications, providerPayments, rankingSnapshots,
  siteAwards, siteClaims, siteScreenshots, sites } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { siteProPredicate } from "@/modules/payments/entitlements";

export async function getDashboard(userId: string, siteCursor?: string) {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Your dashboard is temporarily unavailable.", 503);
  if (siteCursor && !z.uuid().safeParse(siteCursor).success) throw new AppError("INVALID_REQUEST", "Invalid website cursor.", 400);
  const [ownedSites, messages, orders, payments, claims, grants, rankings, awards, screenshots, totals, advertisements] = await Promise.all([
    db.select({ id: sites.id, slug: sites.slug, name: sites.name, score: sites.currentScore, trend: sites.trend,
      lifecycle: sites.lifecycle, badgeStatus: sites.badgeStatus, isPro: sql<boolean>`${siteProPredicate(sql`${sites.id}`, sql`${sites.ownerId}`, sql`${sites.tier}`)}`,
      monitoringPaused: sites.monitoringPaused, lastTestedAt: sites.lastTestedAt })
      .from(sites).where(and(eq(sites.ownerId, userId), siteCursor ? sql`${sites.id} > ${siteCursor}::uuid` : sql`true`)).orderBy(sites.id).limit(51),
    db.select({ id: notifications.id, type: notifications.type, readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(30),
    db.select({ id: checkoutOrders.id, status: checkoutOrders.status, createdAt: checkoutOrders.createdAt, title: sql<string>`${checkoutOrders.productSnapshot}->>'title'` })
      .from(checkoutOrders).where(eq(checkoutOrders.userId, userId)).orderBy(desc(checkoutOrders.createdAt), desc(checkoutOrders.id)).limit(30),
    db.select({ id: providerPayments.id, amountCents: providerPayments.amountCents, currency: providerPayments.currency,
      status: providerPayments.status, occurredAt: providerPayments.occurredAt }).from(providerPayments)
      .where(eq(providerPayments.userId, userId)).orderBy(desc(providerPayments.createdAt), desc(providerPayments.id)).limit(30),
    db.select({ id: siteClaims.id, siteId: siteClaims.siteId, status: siteClaims.status, method: siteClaims.method, expiresAt: siteClaims.expiresAt })
      .from(siteClaims).where(eq(siteClaims.userId, userId)).orderBy(desc(siteClaims.createdAt), desc(siteClaims.id)).limit(30),
    db.select({ id: entitlements.id, siteId: entitlements.siteId, kind: entitlements.kind, source: entitlements.source, endsAt: entitlements.endsAt })
      .from(entitlements).where(and(eq(entitlements.userId, userId), eq(entitlements.status, "active"),
        sql`${entitlements.startsAt} <= now()`, sql`(${entitlements.endsAt} IS NULL OR ${entitlements.endsAt} > now())`)).limit(100),
    db.select({ siteName: sites.name, rank: rankingSnapshots.rank, score: rankingSnapshots.score, scope: rankingSnapshots.scope,
      scopeKey: rankingSnapshots.scopeKey, period: competitionPeriods.periodKey }).from(rankingSnapshots)
      .innerJoin(sites, eq(sites.id, rankingSnapshots.siteId)).innerJoin(competitionPeriods, eq(competitionPeriods.id, rankingSnapshots.periodId))
      .where(eq(sites.ownerId, userId)).orderBy(desc(competitionPeriods.startAt), desc(rankingSnapshots.id)).limit(20),
    db.select({ siteName: sites.name, title: achievements.title, awardedAt: siteAwards.awardedAt }).from(siteAwards)
      .innerJoin(sites, eq(sites.id, siteAwards.siteId)).innerJoin(achievements, eq(achievements.id, siteAwards.achievementId))
      .where(eq(sites.ownerId, userId)).orderBy(desc(siteAwards.awardedAt), desc(siteAwards.id)).limit(20),
    db.select({ siteName: sites.name, publicUrl: siteScreenshots.publicUrl, device: siteScreenshots.device, capturedAt: siteScreenshots.capturedAt }).from(siteScreenshots)
      .innerJoin(sites, eq(sites.id, siteScreenshots.siteId)).where(and(eq(sites.ownerId, userId), eq(siteScreenshots.status, "ready")))
      .orderBy(desc(siteScreenshots.capturedAt), desc(siteScreenshots.id)).limit(12),
    db.execute<{ websites: number; grants: number; unread: number; claims: number }>(sql`SELECT
      (SELECT count(*)::int FROM sites WHERE owner_id=${userId}) AS websites,
      (SELECT count(*)::int FROM entitlements WHERE user_id=${userId} AND status='active' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())) AS grants,
      (SELECT count(*)::int FROM notifications WHERE user_id=${userId} AND read_at IS NULL) AS unread,
      (SELECT count(*)::int FROM site_claims WHERE user_id=${userId} AND status='pending' AND expires_at>now()) AS claims`),
    db.select({ id: adReservations.id, status: adReservations.status, startsAt: adReservations.startsAt, endsAt: adReservations.endsAt,
      position: adInventory.position, orderIndex: adInventory.orderIndex }).from(adReservations)
      .innerJoin(adInventory, eq(adInventory.id, adReservations.inventoryId)).where(eq(adReservations.userId, userId))
      .orderBy(desc(adReservations.createdAt), desc(adReservations.id)).limit(30),
  ]);
  return { ownedSites: ownedSites.slice(0, 50), nextSiteCursor: ownedSites.length > 50 ? ownedSites[49].id : null,
    messages, orders, payments, claims, grants, rankings, awards, screenshots, totals: totals[0], advertisements };
}
