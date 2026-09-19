import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parsePeriodKey } from "@/modules/rankings/algorithm";
import { RankingView } from "@/components/rankings/RankingView";
export async function generateMetadata({ params }: { params: Promise<{ period: string }> }): Promise<Metadata> { const { period } = await params; return { title: `Monthly results · ${period}`, alternates: { canonical: `/monthly/${period}` } }; }
export default async function Page({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<{ strategy?: string }> }) {
  const { period } = await params;
  try { parsePeriodKey("monthly", period); } catch { notFound(); }
  return <RankingView query={{ kind: "monthly", periodKey: period, strategy: (await searchParams).strategy === "desktop" ? "desktop" : "mobile" }} />;
}
