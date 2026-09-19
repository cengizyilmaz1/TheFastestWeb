import type { Metadata } from "next";
import { listSponsoredPlacements } from "@/modules/sites/directory";
import { SponsoredPlacements } from "@/components/directory/SponsoredPlacements";
import { EmptyState, Pagination } from "@/components/directory/WebsiteList";
export const metadata: Metadata = { title: "Sponsored websites", description: "Explore the websites supporting TheFastestWeb.", robots: { index: false, follow: true }, alternates: { canonical: "/featured" } };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const input = Number((await searchParams).page || 1);
  const result = await listSponsoredPlacements(Number.isInteger(input) && input > 0 && input <= 400 ? input : 1).catch(() => null);
  return <div className="page-shell"><p className="page-eyebrow mb-4">Supporting the directory</p><h1 className="page-title">Worth a closer look.</h1>
    <p className="page-description mb-10 mt-4">Paid placements from websites supporting TheFastestWeb. Sponsorship has no effect on performance scores or competition results.</p>
    {!result ? <EmptyState title="Placements are temporarily unavailable" description="Please try again shortly." /> : !result.items.length ? <EmptyState title="A place for your next audience" description="Discover sponsorship options for your website." href="/pricing" action="View plans" /> : <><SponsoredPlacements sites={result.items} /><Pagination page={result.page} pages={result.pages} href={(page) => "/featured?page=" + page} /></>}
  </div>;
}
