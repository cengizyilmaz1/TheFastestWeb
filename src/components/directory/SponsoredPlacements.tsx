import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { DirectorySite } from "@/modules/sites/directory";

export function SponsoredPlacements({ sites }: { sites: DirectorySite[] }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sites.map((site) => <article key={site.id} className="min-w-0 rounded-xl border border-border bg-bg-main p-5">
    <p className="page-eyebrow">Sponsored</p><h3 className="mt-4 text-xl font-medium"><Link href={"/site/" + encodeURIComponent(site.slug)} className="hover:text-accent">{site.name}</Link></h3>
    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-text-secondary">{site.tagline || site.description}</p>
    <a href={site.url} target="_blank" rel="sponsored noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent">Visit website <ArrowUpRightIcon size={16} aria-hidden /></a>
  </article>)}</div>;
}
