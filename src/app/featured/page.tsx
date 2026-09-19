import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { listSponsoredPlacements } from "@/modules/sites/directory";
import { SponsoredPlacements } from "@/components/directory/SponsoredPlacements";
import { EmptyState, Pagination } from "@/components/directory/WebsiteList";
export const metadata: Metadata = { title: "Sponsored websites", description: "Explore the websites supporting TheFastestWeb.", robots: { index: false, follow: true }, alternates: { canonical: "/featured" } };

const placementFacts = [
  ["Labelled", "Every placement carries a Sponsored label"],
  ["Scores", "Sponsorship never changes a score or a competition result"],
  ["Rotation", "The order of placements rotates every hour"],
  ["Links", "Outbound links are marked as sponsored for search engines"],
];

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const input = Number((await searchParams).page || 1);
  const result = await listSponsoredPlacements(Number.isInteger(input) && input > 0 && input <= 400 ? input : 1).catch(() => null);
  return <div className="page-shell mx-auto max-w-[1240px]">
    <p className="page-eyebrow mb-5">Sponsored placements</p>
    <h1 className="page-title max-w-[16ch]">Worth a closer look.</h1>
    <div className="mt-6 flex flex-col justify-between gap-x-12 gap-y-8 lg:flex-row lg:items-end">
      <p className="page-description">Paid placements from websites supporting TheFastestWeb. Sponsorship has no effect on performance scores or competition results.</p>
      {result && result.total > 0 && <p className="flex shrink-0 items-end gap-3.5">
        <span className="stat-value text-[clamp(2.75rem,5.4vw,4.5rem)] font-medium leading-[.85] text-text-primary">{result.total}</span>
        <span className="pb-0.5 text-sm leading-snug text-text-secondary">{result.total === 1 ? "website" : "websites"}<br />supporting the directory</span>
      </p>}
    </div>
    <div className="mt-12 sm:mt-16">
      {!result ? <EmptyState title="Placements are temporarily unavailable" description="Please try again shortly." href="/featured" action="Try again" />
        : !result.items.length ? <section aria-labelledby="featured-start" className="panel grid gap-10 p-7 sm:p-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <h2 id="featured-start" className="section-title max-w-[14ch]">A place for your next audience.</h2>
            <p className="mt-5 max-w-[46ch] leading-relaxed text-text-secondary">There are no sponsored placements to show right now. Discover sponsorship options for your website.</p>
            <Link href="/pricing" className="button-primary mt-8">View plans <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link>
          </div>
          <div className="self-end">
            <p className="page-eyebrow mb-4">How placements work</p>
            <dl className="text-[15px]">{placementFacts.map(([term, value]) => <div key={term} className="grid gap-x-6 gap-y-1 border-t border-border py-4 last:border-b sm:grid-cols-[7rem_1fr]"><dt className="font-semibold text-text-primary">{term}</dt><dd className="text-text-secondary">{value}</dd></div>)}</dl>
          </div>
        </section> : <>
          <SponsoredPlacements sites={result.items} />
          <Pagination page={result.page} pages={result.pages} href={(page) => "/featured?page=" + page} />
          <div className="mt-16 flex flex-col gap-6 sm:mt-20 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[52ch] text-[15px] leading-relaxed text-text-secondary"><span className="font-semibold text-text-primary">Placements are paid and labelled.</span> They never change a score or a competition result.</p>
            <Link href="/pricing" className="button-secondary shrink-0">View plans</Link>
          </div>
        </>}
    </div>
  </div>;
}
