import type { Metadata } from "next";
import { z } from "zod";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { getCurrentUser } from "@/lib/auth";
import { ClaimForm } from "@/components/claims/ClaimForm";
export const metadata: Metadata = { title: "Claim a website", robots: { index: false, follow: false } };

const sequence = [
  ["Choose a method", "A DNS TXT record or a verification file. Either one shows that you control the domain."],
  ["Add the exact content", "We give you the record name or file address, and the content to publish there."],
  ["Verify", "We check the domain. When the check passes, you manage the website from your dashboard."],
];
const terms = [
  ["DNS TXT record", "Added where you manage the domain's DNS."],
  ["Verification file", "A text file published on the website."],
  ["Challenge", "Expires. Keep the page open until verification is complete."],
  ["Existing owner", "The claim is reviewed before ownership changes."],
];

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const siteId = z.uuid().safeParse((await searchParams).site), user = await getCurrentUser();
  return <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20">
    <h1 className="page-title max-w-[14ch]">Verify domain control.</h1>
    <div className="mt-6 grid gap-x-16 gap-y-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)] xl:gap-x-24">
      <div className="min-w-0">
        <p className="page-description sm:text-lg">Add a DNS record or a verification file to show that you control this website. Existing ownership requires a review before it can change.</p>
        {!siteId.success ? <div className="panel-quiet mt-10 flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-7"><p className="max-w-[44ch] font-medium leading-snug text-text-primary">Open a website report and select “Is this your website?” to get started.</p><Link className="button-secondary shrink-0" href="/explore">Explore websites</Link></div>
          : !user ? <div className="panel-quiet mt-10 flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-7"><p className="max-w-[40ch] font-medium leading-snug text-text-primary">Sign in so the verified website is linked to your account.</p><Link className="button-primary shrink-0" href={`/auth/login?returnTo=${encodeURIComponent(`/claim?site=${siteId.data}`)}`}>Sign in to continue <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link></div>
          : <ClaimForm siteId={siteId.data} />}
      </div>
      <aside aria-labelledby="claim-how" className="min-w-0 lg:pt-1">
        <h2 id="claim-how" className="text-lg font-semibold tracking-[-.02em] font-stretch-[112%]">How verification works</h2>
        <ol className="mt-5">{sequence.map(([title, detail], index) => <li key={title} className="flex gap-5 border-t border-border py-5"><span aria-hidden className="stat-value w-6 shrink-0 pt-0.5 text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span><span><span className="block text-[15px] font-semibold text-text-primary">{title}</span><span className="mt-1 block text-sm leading-relaxed text-text-secondary">{detail}</span></span></li>)}</ol>
        <dl className="border-t border-border-light text-sm">{terms.map(([term, detail]) => <div key={term} className="grid gap-x-6 gap-y-1 border-b border-border py-3.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]"><dt className="font-semibold text-text-primary">{term}</dt><dd className="leading-relaxed text-text-secondary">{detail}</dd></div>)}</dl>
      </aside>
    </div>
  </div>;
}
