import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { listFounders } from "@/modules/sites/directory";
import { EmptyState, Pagination } from "@/components/directory/WebsiteList";
import { FounderList } from "./FounderList";
export const metadata: Metadata = { title: "Meet the founders", description: "Meet the people building and improving the websites in TheFastestWeb directory.", alternates: { canonical: "/founders" } };

const profileFacts = [
  ["Identity", "Your name, bio, country and the links you choose"],
  ["Websites", "Every public website you have linked to the profile"],
  ["Track record", "Latest scores, weekly wins, rankings and earned badges"],
  ["Kept private", "Your account email and account ID never appear"],
];

export default async function FoundersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = Number((await searchParams).page || 1), page = Number.isInteger(raw) && raw > 0 && raw <= 400 ? raw : 1;
  const result = await listFounders(page).catch(() => null);
  return <div className="page-shell mx-auto max-w-[1240px]">
    <h1 className="page-title max-w-[16ch]">People who care about speed.</h1>
    <div className="mt-6 flex flex-col justify-between gap-x-12 gap-y-8 lg:flex-row lg:items-end">
      <p className="page-description">A good website starts with someone who gives it care. Meet the founders who have chosen to share their work.</p>
      {result && result.total > 0 && <p className="flex shrink-0 items-end gap-3.5">
        <span className="stat-value text-[clamp(2.75rem,5.4vw,4.5rem)] font-medium leading-[.85] text-text-primary">{result.total}</span>
        <span className="pb-0.5 text-sm leading-snug text-text-secondary">{result.total === 1 ? "founder" : "founders"}<br />with a public profile</span>
      </p>}
    </div>
    <div className="mt-12 sm:mt-16">
      {!result ? <EmptyState title="Profiles are temporarily unavailable" description="We could not load founder profiles. Please check back shortly." href="/founders" action="Try again" />
        : !result.founders.length ? <section aria-labelledby="founders-start" className="panel grid gap-10 p-7 sm:p-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <h2 id="founders-start" className="section-title max-w-[14ch]">The community starts with you.</h2>
            <p className="mt-5 max-w-[46ch] leading-relaxed text-text-secondary">Create a founder profile and choose to make it public. Account information stays private.</p>
            <Link href="/dashboard" className="button-primary mt-8">Create your profile <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link>
          </div>
          <div className="self-end">
            <p className="page-eyebrow mb-4">What a public profile shows</p>
            <dl className="text-[15px]">{profileFacts.map(([term, value]) => <div key={term} className="grid gap-x-6 gap-y-1 border-t border-border py-4 last:border-b sm:grid-cols-[8.5rem_1fr]"><dt className="font-semibold text-text-primary">{term}</dt><dd className="text-text-secondary">{value}</dd></div>)}</dl>
          </div>
        </section> : <>
          <FounderList founders={result.founders} />
          <Pagination page={page} pages={result.pages} href={(next) => `/founders?page=${next}`} />
          <div className="mt-16 flex flex-col gap-6 sm:mt-20 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[52ch] text-[15px] leading-relaxed text-text-secondary"><span className="font-semibold text-text-primary">Profiles are opt-in.</span> Create yours and choose to make it public. Account information stays private.</p>
            <Link href="/dashboard" className="button-secondary shrink-0">Create your profile</Link>
          </div>
        </>}
    </div>
  </div>;
}
