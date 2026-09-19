import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getPeriodBounds } from "../src/modules/rankings/algorithm";

/** Browser fixture only. Requires an explicitly created disposable integration DB and synthetic sites. */
export async function seedRuntimeRankings(connection: ReturnType<typeof postgres>, siteIds: readonly string[]) {
  return connection.begin(async tx=>{
    const [guard]=await tx`SELECT current_database() AS database,now() AS now`;
    if(!/^tfw_test_listing_[a-f0-9]{12}$/.test(guard.database)||siteIds.length!==2||new Set(siteIds).size!==2)
      throw new Error("Ranking fixtures require the disposable two-site browser database");
    const websites=await tx`SELECT id,slug,name,url FROM sites WHERE id IN ${tx(siteIds)} ORDER BY slug`;
    if(websites.length!==2||websites.some(row=>!row.slug.startsWith("synthetic-")))
      throw new Error("Ranking fixture site guard rejected the request");
    const keys:{weekly:string;monthly:string}={weekly:"",monthly:""};
    for(const kind of ["weekly","monthly"] as const){
      const current=getPeriodBounds(kind,guard.now),bounds=getPeriodBounds(kind,new Date(current.startAt.getTime()-1)),periodId=randomUUID();
      keys[kind]=bounds.periodKey;
      await tx`INSERT INTO competition_periods(id,kind,period_key,start_at,end_at,status,ranking_algorithm_version,performance_method_version)
        VALUES(${periodId},${kind},${bounds.periodKey},${bounds.startAt},${bounds.endAt},'open','ranking-v1','psi-v2-two-sample')`;
      for(const strategy of ["mobile","desktop"] as const){
        for(const [index,website] of websites.entries()){
          const rank=index+1,score=strategy==="mobile"?95-index*8:98-index*6;
          const testedAt=new Date(bounds.endAt.getTime()-86_400_000),measurementId=randomUUID();
          await tx`INSERT INTO speed_tests(id,site_id,score,lcp_ms,cls,tbt_ms,fcp_ms,si_ms,strategy,methodology_version,sample_count,metrics_source,tested_at)
            VALUES(${measurementId},${website.id},${score},1000,0.02,20,700,1200,${strategy},'psi-v2-two-sample',2,'lab',${testedAt})`;
          await tx`INSERT INTO ranking_snapshots(period_id,scope,scope_key,strategy,site_id,rank,score,lcp_ms,cls,tbt_ms,sample_count,evidence,site_snapshot)
            VALUES(${periodId},'overall','',${strategy},${website.id},${rank},${score},1000,0.02,20,2,
              ${tx.json({measurementId,testedAt:testedAt.toISOString(),methodologyVersion:"psi-v2-two-sample",metricsSource:"lab",sampleCount:2})},
              ${tx.json({id:website.id,slug:website.slug,name:website.name,url:website.url})})`;
        }
      }
      // The immutability trigger permits writes only while open, then one close transition.
      await tx`UPDATE competition_periods SET status='closed',closed_at=now() WHERE id=${periodId}`;
    }
    return keys;
  });
}
