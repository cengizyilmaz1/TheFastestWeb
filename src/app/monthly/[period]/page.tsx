import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parsePeriodKey } from "@/modules/rankings/algorithm";
import { RankingView } from "@/components/rankings/RankingView";
import { CompetitionArchive } from "@/components/rankings/CompetitionArchive";
import { getCompetitionOverview } from "@/modules/rankings/overview";
export async function generateMetadata({ params }: { params: Promise<{ period: string }> }): Promise<Metadata> {
  const {period}=await params,archive=await getCompetitionOverview("monthly",period,"mobile").catch(()=>null);
  return {title:`Monthly results · ${period}`,alternates:{canonical:`/monthly/${period}`},...(!archive||archive.stats.finalists<2?{robots:{index:false}}:{})};
}
export default async function Page({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<{ strategy?: string }> }) {
  const { period } = await params;
  try { parsePeriodKey("monthly", period); } catch { notFound(); }
  const strategy=(await searchParams).strategy==="desktop"?"desktop":"mobile";
  const archive=await getCompetitionOverview("monthly",period,strategy);
  return archive?<CompetitionArchive data={archive}/>:<RankingView query={{kind:"monthly",periodKey:period,strategy}}/>;
}
