import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { backgroundJobs, notificationPreferences, sites, type BackgroundJob } from "@/db/schema";
import { getVerifiedBadge } from "@/infrastructure/browser/badge-verification";
import { enqueueNotification } from "@/modules/notifications/service";
import { hasSiteProAccess } from "@/modules/payments/entitlements";
import { recordAnalyticsEvent } from "@/modules/analytics/events";
import { AppError } from "@/lib/http/errors";

export const BADGE_GRACE_DAYS=7;
export async function verifySiteBadge(siteId:string,options:{dryRun?:boolean;notify?:boolean;job?:BackgroundJob}={}) {
  z.uuid().parse(siteId);
  const db=getDb();
  if(!db) throw new AppError("DATABASE_UNAVAILABLE","Badge checks are temporarily unavailable.",503);
  const [target]=await db.select().from(sites).where(eq(sites.id,siteId));
  if(!target || !target.isListed || target.lifecycle!=="active" || target.archivedAt || !target.requiresBadge) return { status:"skipped" as const };
  if(await hasSiteProAccess(siteId)) return {status:"skipped" as const};
  const observation=await getVerifiedBadge(target.url,target.slug);
  return db.transaction(async(tx)=>{
    if(options.job) {
      const [owned]=await tx.select({id:backgroundJobs.id}).from(backgroundJobs).where(and(eq(backgroundJobs.id,options.job.id),
        eq(backgroundJobs.status,"running"),eq(backgroundJobs.leaseToken,options.job.leaseToken!),sql`${backgroundJobs.leasedUntil}>now()`)).for("update");
      if(!owned) return {status:"skipped" as const};
    }
    const [site]=await tx.select().from(sites).where(and(eq(sites.id,siteId),eq(sites.url,target.url))).for("update");
    if(!site || !site.requiresBadge || !site.isListed || site.lifecycle!=="active" || site.archivedAt) return { status:"skipped" as const };
    if(await hasSiteProAccess(siteId,tx)) return {status:"skipped" as const};
    const [clock]=await tx.execute<{ now_ms:string }>(sql`SELECT extract(epoch FROM now())*1000 AS now_ms`);
    const now=new Date(Number(clock.now_ms));
    let proposed:typeof site.badgeStatus;
    let grace=site.badgeGraceUntil;
    if(observation.status==="verified") { proposed="verified";grace=null; }
    else if(observation.status==="temporarily_unreachable") proposed="temporarily_unreachable";
    else if(observation.status==="invalid_url") proposed="failed";
    else {
      grace ??= new Date(now.getTime()+BADGE_GRACE_DAYS*86_400_000);
      proposed=grace>now ? "grace_period" : "failed";
    }
    const result={ status:proposed,observation:observation.status,previous:site.badgeStatus,
      dryRun:options.dryRun!==false,graceUntil:grace?.toISOString() ?? null };
    if(result.dryRun) return result;
    await tx.update(sites).set({ badgeStatus:proposed,badgeCheckedAt:sql`now()`,badgeGraceUntil:grace }).where(eq(sites.id,siteId));
    if(proposed==="verified" && site.badgeStatus!=="verified") await recordAnalyticsEvent({name:"badge_verified",
      eventKey:`badge-verified:${options.job?.id ?? `${siteId}:${now.toISOString().slice(0,10)}`}`,siteId,properties:{}},tx);
    // A failed check never deletes, unlists, archives, pauses, or revokes any access.
    if(options.notify && site.ownerId && proposed!==site.badgeStatus && ["grace_period","failed"].includes(proposed)) {
      const [preferences]=await tx.select().from(notificationPreferences).where(eq(notificationPreferences.userId,site.ownerId));
      if(preferences?.badge ?? true) await enqueueNotification({ userId:site.ownerId,
        eventKey:`badge-warning:${siteId}:${proposed}:${now.toISOString().slice(0,10)}`,type:"badge_warning",
        variables:{ siteName:site.name,actionPath:`/site/${site.slug}` } },tx);
    }
    return result;
  });
}
