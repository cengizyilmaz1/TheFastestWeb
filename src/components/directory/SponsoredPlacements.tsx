import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { DirectorySite } from "@/modules/sites/directory";
import { monogram } from "./WebsiteList";

/** Paid placements stay labelled and quieter than measured results: hairline rows, no scores, no cards. */
export function SponsoredPlacements({ sites }: { sites: DirectorySite[] }) {
  return <ul className={"grid gap-x-14 " + (sites.length > 1 ? "lg:grid-cols-2" : "")}>{sites.map((site) => <li key={site.id} className={"min-w-0 border-b border-border first:border-t" + (sites.length > 1 ? " lg:[&:nth-child(2)]:border-t" : "")}>
    <article className="group flex items-start gap-4 py-6 sm:gap-5 sm:py-7">
      <span aria-hidden className="monogram h-12 w-12 text-base transition-colors group-hover:bg-brand group-hover:text-on-brand">{monogram(site.name)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <h3 className="min-w-0 text-xl font-semibold leading-snug tracking-[-.03em]"><Link href={"/site/" + encodeURIComponent(site.slug)} className="no-underline hover:underline hover:decoration-brand hover:decoration-[3px] hover:underline-offset-4">{site.name}</Link></h3>
          <span className="mt-1 flex-none rounded-full border border-border-light px-2.5 py-0.5 text-xs font-medium text-text-secondary">Sponsored</span>
        </div>
        <p className="mt-2 line-clamp-2 max-w-[58ch] text-sm leading-relaxed text-text-secondary">{site.tagline || site.description}</p>
        <a href={site.url} target="_blank" rel="sponsored noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-text-primary underline decoration-brand decoration-2 underline-offset-[5px] transition-colors hover:decoration-text-primary">Visit website <ArrowUpRightIcon size={15} weight="bold" aria-hidden /><span className="sr-only">: {site.name}</span></a>
      </div>
    </article>
  </li>)}</ul>;
}
