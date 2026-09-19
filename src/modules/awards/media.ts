import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { getDb } from "@/db";
import { achievements, siteAwards, sites } from "@/db/schema";
import { siteConfig } from "@/config/site";
import { isStorageEnabled, putObject } from "@/infrastructure/storage/r2";
import { AppError } from "@/lib/http/errors";
import { escapeXml } from "@/lib/seo/xml";
import { recordAnalyticsEvent } from "@/modules/analytics/events";

function database() { const db=getDb(); if(!db) throw new AppError("DATABASE_UNAVAILABLE","Award images are temporarily unavailable.",503); return db; }
const missing=()=>new AppError("NOT_FOUND","Award not found.",404);
const projection={id:siteAwards.id,siteId:sites.id,slug:sites.slug,name:sites.name,title:achievements.title,
  awardedAt:siteAwards.awardedAt,evidence:siteAwards.evidence};
const publicAward=(id:string)=>and(eq(siteAwards.id,id),eq(sites.isListed,true),eq(sites.lifecycle,"active"),isNull(sites.archivedAt));
export type AwardImage = {
  id:string;siteId:string;slug:string;name:string;title:string;awardedAt:Date;evidence:Record<string,unknown>;
};
export async function getPublicAwardImage(id:string):Promise<AwardImage> {
  if(!z.uuid().safeParse(id).success) throw missing();
  const [award]=await database().select(projection).from(siteAwards).innerJoin(sites,eq(sites.id,siteAwards.siteId))
    .innerJoin(achievements,eq(achievements.id,siteAwards.achievementId)).where(publicAward(id));
  if(!award) throw missing();
  return award;
}
// Text-only templates: no arbitrary markup, links, external fonts or images enter SVG.
function text(value:string,max:number) {
  const clean=Array.from(value).filter(char=>{const n=char.codePointAt(0)!;return n>=32 && n!==127
    && (n<=0xd7ff || (n>=0xe000 && n<=0xfffd) || n>=0x10000);}).join("");
  const parts=Array.from(clean);
  return escapeXml(parts.length>max ? parts.slice(0,max-1).join("")+"…" : clean);
}
function subtitle(award:AwardImage) {
  const strategy=award.evidence.strategy==="desktop" ? "Desktop" : award.evidence.strategy==="mobile" ? "Mobile" : "";
  const period=typeof award.evidence.periodKey==="string" ? award.evidence.periodKey : award.awardedAt.toISOString().slice(0,10);
  return [strategy,period].filter(Boolean).join(" · ");
}
/** Scores and labels come from the awarded evidence, never the site's changing current score. */
export function renderAwardSvg(award:AwardImage,format:"embed"|"share"="embed"):string {
  const share=format==="share",width=share?1200:420,height=share?630:112;
  const score=typeof award.evidence.score==="number" && Number.isFinite(award.evidence.score)
    && award.evidence.score>=0 && award.evidence.score<=100 ? String(award.evidence.score) : "★";
  return share ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1200 630" role="img" aria-label="${text(award.title,80)}"><rect width="1200" height="630" fill="#f5f3ed"/><path d="M64 124H1136M64 528H1136" stroke="#171717" stroke-width="2"/><text x="64" y="82" font-family="sans-serif" font-size="25" font-weight="700" fill="#171717">THE FASTEST WEB / VERIFIED ACHIEVEMENT</text><text x="64" y="223" font-family="sans-serif" font-size="28" fill="#555555">${text(subtitle(award),60)}</text><text x="64" y="305" font-family="sans-serif" font-size="52" font-weight="700" fill="#171717">${text(award.title,34)}</text><text x="64" y="384" font-family="sans-serif" font-size="36" fill="#171717">${text(award.name,40)}</text><text x="64" y="464" font-family="sans-serif" font-size="22" fill="#555555">Recorded lab evidence · separate device results</text><text x="1136" y="582" text-anchor="end" font-family="sans-serif" font-size="24" fill="#171717">${text(new URL(siteConfig.url).host,65)}</text></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 420 112" role="img" aria-label="${text(award.title,80)}"><rect x="1" y="1" width="418" height="110" rx="8" fill="#f5f3ed" stroke="#171717" stroke-width="2"/><rect x="14" y="14" width="82" height="84" rx="5" fill="#171717"/><text x="55" y="66" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="#ffffff">${text(score,6)}</text><text x="112" y="32" font-family="sans-serif" font-size="10" fill="#555555">THE FASTEST WEB</text><text x="112" y="56" font-family="sans-serif" font-size="17" font-weight="700" fill="#171717">${text(award.title,28)}</text><text x="112" y="76" font-family="sans-serif" font-size="12" fill="#171717">${text(award.name,36)}</text><text x="112" y="94" font-family="sans-serif" font-size="10" fill="#555555">${text(subtitle(award),45)}</text></svg>`;
}
export async function renderAwardPng(award:AwardImage):Promise<Buffer> {
  return sharp(Buffer.from(renderAwardSvg(award,"share")),{limitInputPixels:1200*630,failOn:"error"})
    .png({compressionLevel:9}).toBuffer();
}
export async function generatePublicAwardPng(id:string) {
  const award=await getPublicAwardImage(id),bytes=await renderAwardPng(award);
  await recordAnalyticsEvent({name:"share_card_generated",eventKey:`share-card:${id}`,siteId:award.siteId,properties:{awardId:id}});
  return bytes;
}
/** Explicit owner promotion is the only operation that uploads public bytes. GET remains local. */
export async function promoteAwardImage(id:string,userId:string) {
  if(!z.uuid().safeParse(id).success) throw missing();
  return database().transaction(async(tx)=>{
    const [award]=await tx.select(projection).from(siteAwards).innerJoin(sites,eq(sites.id,siteAwards.siteId))
      .innerJoin(achievements,eq(achievements.id,siteAwards.achievementId))
      .where(and(publicAward(id),eq(sites.ownerId,userId))).for("share");
    if(!award) throw missing();
    if(!isStorageEnabled()) return {stored:false as const,url:`${siteConfig.url}/api/awards/${id}/share.png`};
    const bytes=await renderAwardPng(award),hash=createHash("sha256").update(bytes).digest("hex");
    const stored=await putObject({bytes,contentType:"image/png",visibility:"public",objectKey:`thefastestweb/awards/${id}/${hash}.png`});
    await recordAnalyticsEvent({name:"share_card_generated",eventKey:`share-card:${id}`,siteId:award.siteId,properties:{awardId:id}},tx);
    return {stored:true as const,url:stored.publicUrl!,hash:stored.hash,objectKey:stored.objectKey};
  });
}

export const awardImageHeaders=(type:"image/svg+xml"|"image/png")=>({"Content-Type":type,
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"});
