import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { DirectoryView } from "@/components/directory/DirectoryView";
import { Segmented, SegmentedLink } from "@/components/rankings/RankingParts";
import { directorySchema } from "@/modules/sites/directory";
const tiers = { perfect: { score: 100, title: "A perfect recorded score.", label: "Perfect 100" }, "90-plus": { score: 90, title: "90 and beyond.", label: "90 and up" }, "80-plus": { score: 80, title: "Built with performance in mind.", label: "80 and up" } };
export async function generateMetadata({ params }: { params: Promise<{ tier: string }> }): Promise<Metadata> { const { tier } = await params; return { title: "Recorded website performance", alternates: { canonical: "/leaderboard/" + tier } }; }
export default async function Page({ params, searchParams }: { params: Promise<{ tier: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tier } = await params;
  if (!(tier in tiers)) notFound();
  const entry = tiers[tier as keyof typeof tiers];
  const parsed = directorySchema.safeParse({ ...await searchParams, minScore: entry.score });
  return <>
    <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 pt-8 sm:px-8 sm:pt-10">
      <Link href="/leaderboard" className="group inline-flex min-h-11 items-center gap-2 text-sm font-medium text-text-secondary no-underline transition-colors hover:text-text-primary"><ArrowLeftIcon size={16} aria-hidden className="transition-transform group-hover:-translate-x-1" />Rankings</Link>
      <Segmented label="Recorded score tier">{Object.entries(tiers).map(([slug, item]) => <SegmentedLink key={slug} href={"/leaderboard/" + slug} current={slug === tier}>{item.label}</SegmentedLink>)}</Segmented>
    </div>
    <div className="-mt-2 sm:-mt-8"><DirectoryView title={entry.title} description={"Websites with a latest recorded mobile score of " + entry.score + " or higher. Historical results are distinct from current competitions."} query={parsed.success ? parsed.data : { minScore: entry.score }} basePath={"/leaderboard/" + tier} fixedMinScore /></div>
  </>;
}
