import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parsePeriodKey } from "@/modules/rankings/algorithm";
import { RankingView } from "@/components/rankings/RankingView";
export async function generateMetadata({ params }: { params: Promise<{ period: string }> }): Promise<Metadata> { const { period } = await params; return { title: `Weekly results · ${period}`, alternates: { canonical: `/weekly/${period}` } }; }
export default async function Page({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<{ strategy?: string }> }) {
  const { period } = await params;
  try { parsePeriodKey("weekly", period); } catch { notFound(); }
  return <RankingView query={{ kind: "weekly", periodKey: period, strategy: (await searchParams).strategy === "desktop" ? "desktop" : "mobile" }} />;
}
