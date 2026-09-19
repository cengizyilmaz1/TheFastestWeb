import { and,desc,eq,inArray,sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { founders,founderSites,founderSiteInvitations,sites } from "@/db/schema";
import { AppError } from "@/lib/http/errors";

export const inviteFounderSchema=z.object({siteId:z.uuid(),founderId:z.uuid().optional(),
  founderSlug:z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional()}).strict()
  .refine(value=>Boolean(value.founderId)!==Boolean(value.founderSlug),"Choose one founder identifier.");
export const respondFounderInvitationSchema=z.object({invitationId:z.uuid(),decision:z.enum(["accept","reject","revoke"])}).strict();
export const removeFounderSchema=z.object({siteId:z.uuid(),founderId:z.uuid()}).strict();
function database(){const db=getDb();if(!db)throw new AppError("DATABASE_UNAVAILABLE","Collaborations are temporarily unavailable.",503);return db;}
const missing=()=>new AppError("NOT_FOUND","Collaboration not found.",404);
const unavailable=(site:{lifecycle:string;archivedAt:Date|null})=>Boolean(site.archivedAt)||["archived","removed","suspended"].includes(site.lifecycle);
const invitationResult=(row:typeof founderSiteInvitations.$inferSelect)=>({id:row.id,status:row.status,expiresAt:row.expiresAt});

/** The site owner may request attribution; this never creates the relationship itself. */
export async function inviteFounder(userId:string,raw:unknown){
  const input=inviteFounderSchema.parse(raw);
  return database().transaction(async(tx)=>{
    const [site]=await tx.select().from(sites).where(and(eq(sites.id,input.siteId),eq(sites.ownerId,userId))).for("update");
    if(!site || unavailable(site))throw missing();
    const [founder]=await tx.select().from(founders).where(and(input.founderId?eq(founders.id,input.founderId):eq(founders.slug,input.founderSlug!),eq(founders.visibility,"public"))).for("share");
    if(!founder?.userId)throw missing();
    if(founder.userId===userId)throw new AppError("CONFLICT","Link your own founder profile directly.",409);
    const [linked]=await tx.select({id:founderSites.founderId}).from(founderSites).where(and(eq(founderSites.siteId,site.id),eq(founderSites.founderId,founder.id)));
    if(linked)throw new AppError("CONFLICT","This founder is already linked.",409);
    await tx.update(founderSiteInvitations).set({status:sql`CASE WHEN expires_at<=now() THEN 'expired' ELSE 'revoked' END`,respondedAt:sql`now()`,updatedAt:sql`now()`})
      .where(and(eq(founderSiteInvitations.siteId,site.id),eq(founderSiteInvitations.founderId,founder.id),eq(founderSiteInvitations.status,"pending"),
        sql`(${founderSiteInvitations.expiresAt}<=now() OR ${founderSiteInvitations.inviterUserId}<>${userId} OR ${founderSiteInvitations.invitedUserId}<>${founder.userId})`));
    const [existing]=await tx.select().from(founderSiteInvitations).where(and(eq(founderSiteInvitations.siteId,site.id),eq(founderSiteInvitations.founderId,founder.id),eq(founderSiteInvitations.status,"pending")));
    if(existing)return invitationResult(existing);
    const [created]=await tx.insert(founderSiteInvitations).values({siteId:site.id,founderId:founder.id,inviterUserId:userId,invitedUserId:founder.userId}).returning();
    return invitationResult(created);
  });
}

/** Locks always follow site -> founder -> invitation, matching invitation/removal operations. */
export async function respondFounderInvitation(userId:string,raw:unknown){
  const input=respondFounderInvitationSchema.parse(raw);
  const result=await database().transaction(async(tx)=>{
    const [reference]=await tx.select().from(founderSiteInvitations).where(eq(founderSiteInvitations.id,input.invitationId));
    if(!reference)throw missing();
    const [site]=await tx.select().from(sites).where(eq(sites.id,reference.siteId)).for("update");
    const [founder]=await tx.select().from(founders).where(eq(founders.id,reference.founderId)).for("share");
    const [invitation]=await tx.select().from(founderSiteInvitations).where(eq(founderSiteInvitations.id,input.invitationId)).for("update");
    if(!site || !founder || !invitation || invitation.siteId!==site.id || invitation.founderId!==founder.id)throw missing();
    if(input.decision==="revoke" ? site.ownerId!==userId : invitation.invitedUserId!==userId || founder.userId!==userId)throw missing();
    const desired=input.decision==="accept"?"accepted":input.decision==="reject"?"declined":"revoked";
    if(invitation.status!=="pending"){
      if(invitation.status!==desired)throw new AppError("CONFLICT","This invitation has already been resolved.",409);
      // Consumed invitations acknowledge replay but never recreate a detached link.
      const [link]=await tx.select({id:founderSites.founderId}).from(founderSites).where(and(eq(founderSites.siteId,site.id),eq(founderSites.founderId,founder.id)));
      return {...invitationResult(invitation),linked:Boolean(link)};
    }
    const [clock]=await tx.execute<{expired:boolean}>(sql`SELECT ${invitation.expiresAt.toISOString()}::timestamptz<=now() AS expired`);
    const stale=site.ownerId!==invitation.inviterUserId || founder.userId!==invitation.invitedUserId || founder.visibility!=="public" || unavailable(site);
    if(clock.expired || (input.decision==="accept" && stale)){
      await tx.update(founderSiteInvitations).set({status:clock.expired?"expired":"revoked",respondedAt:sql`now()`,updatedAt:sql`now()`}).where(eq(founderSiteInvitations.id,invitation.id));
      // Return the public error after committing the invalidated state.
      return {error:new AppError("CONFLICT",clock.expired?"This invitation has expired.":"The site or founder profile changed. Request a new invitation.",409)};
    }
    if(desired==="accepted")await tx.insert(founderSites).values({siteId:site.id,founderId:founder.id}).onConflictDoNothing();
    const [updated]=await tx.update(founderSiteInvitations).set({status:desired,respondedAt:sql`now()`,updatedAt:sql`now()`})
      .where(eq(founderSiteInvitations.id,invitation.id)).returning();
    return {...invitationResult(updated),linked:desired==="accepted"};
  });
  if("error" in result)throw result.error;
  return result;
}

/** Owners manage their own site; a founder can always withdraw their own attribution. */
export async function removeFounderLink(userId:string,raw:unknown){
  const input=removeFounderSchema.parse(raw);
  return database().transaction(async(tx)=>{
    const [site]=await tx.select({ownerId:sites.ownerId}).from(sites).where(eq(sites.id,input.siteId)).for("update");
    const [founder]=await tx.select({userId:founders.userId}).from(founders).where(eq(founders.id,input.founderId)).for("share");
    if(!site || !founder || (site.ownerId!==userId && founder.userId!==userId))throw missing();
    const removed=await tx.delete(founderSites).where(and(eq(founderSites.siteId,input.siteId),eq(founderSites.founderId,input.founderId))).returning();
    await tx.update(founderSiteInvitations).set({status:site.ownerId===userId?"revoked":"declined",respondedAt:sql`now()`,updatedAt:sql`now()`})
      .where(and(eq(founderSiteInvitations.siteId,input.siteId),eq(founderSiteInvitations.founderId,input.founderId),eq(founderSiteInvitations.status,"pending")));
    return {removed:removed.length>0};
  });
}

/** Private dashboard projection. No account UUID, email, token or private profile name escapes. */
export async function listCollaborations(userId:string){
  const db=database();
  const projection={id:founderSiteInvitations.id,status:founderSiteInvitations.status,expiresAt:founderSiteInvitations.expiresAt,createdAt:founderSiteInvitations.createdAt,
    inviterId:founderSiteInvitations.inviterUserId,currentOwner:sites.ownerId,site:{id:sites.id,name:sites.name,slug:sites.slug},
    isListed:sites.isListed,linked:sql<boolean>`EXISTS(SELECT 1 FROM founder_sites relation WHERE relation.site_id=${sites.id} AND relation.founder_id=${founders.id})`,
    archivedAt:sites.archivedAt,lifecycle:sites.lifecycle,founder:{id:founders.id,name:founders.name,slug:founders.slug,visibility:founders.visibility}};
  const [incoming,outgoing,owned,ownLinks,[clock]]=await Promise.all([
    db.select(projection).from(founderSiteInvitations).innerJoin(sites,eq(sites.id,founderSiteInvitations.siteId)).innerJoin(founders,eq(founders.id,founderSiteInvitations.founderId))
      .where(and(eq(founderSiteInvitations.invitedUserId,userId),eq(founders.userId,userId))).orderBy(desc(founderSiteInvitations.createdAt),desc(founderSiteInvitations.id)).limit(50),
    db.select(projection).from(founderSiteInvitations).innerJoin(sites,eq(sites.id,founderSiteInvitations.siteId)).innerJoin(founders,eq(founders.id,founderSiteInvitations.founderId))
      .where(eq(sites.ownerId,userId)).orderBy(desc(founderSiteInvitations.createdAt),desc(founderSiteInvitations.id)).limit(50),
    db.select({id:sites.id,name:sites.name,slug:sites.slug}).from(sites).where(eq(sites.ownerId,userId)).orderBy(desc(sites.createdAt),sites.id).limit(100),
    db.select({site:{id:sites.id,name:sites.name,slug:sites.slug},founderId:founders.id}).from(founderSites).innerJoin(sites,eq(sites.id,founderSites.siteId)).innerJoin(founders,eq(founders.id,founderSites.founderId))
      .where(eq(founders.userId,userId)).orderBy(sites.id).limit(100),
    db.execute<{now_ms:string}>(sql`SELECT extract(epoch FROM now())*1000 AS now_ms`),
  ]);
  const ownedLinks=owned.length?await db.select({siteId:founderSites.siteId,id:founders.id,name:founders.name,slug:founders.slug,visibility:founders.visibility,own:sql<boolean>`${founders.userId}=${userId}`})
    .from(founderSites).innerJoin(founders,eq(founders.id,founderSites.founderId)).where(inArray(founderSites.siteId,owned.map(row=>row.id))).orderBy(founderSites.siteId,founders.id).limit(1000):[];
  const present=(row:typeof incoming[number],own:boolean)=>{
    const expired=row.expiresAt.getTime()<=Number(clock.now_ms),stale=row.currentOwner!==row.inviterId || row.founder.visibility!=="public" || unavailable(row);
    const status=row.status==="pending" ? expired?"expired":stale?"revoked":"pending" : row.status;
    const canReadSite=!own || status==="pending" || row.linked || (row.isListed && !row.archivedAt && ["active","verified","unreachable","redirected","parked"].includes(row.lifecycle));
    return {id:row.id,site:canReadSite?row.site:{id:row.site.id,name:"Unavailable website",slug:""},founder:{id:row.founder.id,name:own||row.founder.visibility==="public"?row.founder.name:"Private profile",
      slug:own||row.founder.visibility==="public"?row.founder.slug:null},status,expiresAt:row.expiresAt,createdAt:row.createdAt,canRespond:status==="pending"};
  };
  return {incoming:incoming.map(row=>present(row,true)),outgoing:outgoing.map(row=>present(row,false)),
    ownedSites:owned.map(site=>({...site,founders:ownedLinks.filter(row=>row.siteId===site.id).map(row=>({id:row.id,
      name:row.own||row.visibility==="public"?row.name:"Private profile",slug:row.own||row.visibility==="public"?row.slug:null,visibility:row.visibility}))})),ownLinks};
}
