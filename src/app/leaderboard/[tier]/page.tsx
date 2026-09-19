import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryView } from "@/components/directory/DirectoryView";
import { directorySchema } from "@/modules/sites/directory";
const tiers = { perfect: { score: 100, title: "A perfect recorded score." }, "90-plus": { score: 90, title: "90 and beyond." }, "80-plus": { score: 80, title: "Built with performance in mind." } };
export async function generateMetadata({ params }: { params: Promise<{ tier: string }> }): Promise<Metadata> { const { tier } = await params; return { title: "Recorded website performance", alternates: { canonical: "/leaderboard/" + tier } }; }
export default async function Page({ params, searchParams }: { params: Promise<{ tier: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tier } = await params;
  if (!(tier in tiers)) notFound();
  const entry = tiers[tier as keyof typeof tiers];
  const parsed = directorySchema.safeParse({ ...await searchParams, minScore: entry.score });
  return <DirectoryView title={entry.title} description={"Websites with a latest recorded mobile score of " + entry.score + " or higher. Historical results are distinct from current competitions."} query={parsed.success ? parsed.data : { minScore: entry.score }} basePath={"/leaderboard/" + tier} />;
}
