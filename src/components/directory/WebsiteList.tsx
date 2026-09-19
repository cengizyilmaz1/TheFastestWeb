import Link from "next/link";
import { ArrowUpRightIcon, GlobeHemisphereWestIcon } from "@phosphor-icons/react/dist/ssr";
import type { DirectorySite } from "@/modules/sites/directory";

export function WebsiteList({ sites, start = 1, compact = false }: { sites: DirectorySite[]; start?: number; compact?: boolean }) {
  if (!sites.length) return <EmptyState title="No websites here yet" description="Try a different filter, or be the first to submit a website." />;
  return <div className="min-w-0"><table className="w-full table-fixed border-collapse text-left text-sm">
    <caption className="sr-only">Websites by their latest recorded mobile performance score</caption>
    <thead className="border-b border-border text-xs font-normal text-text-muted">
      <tr><th className="w-8 py-3 pr-3 font-normal">#</th><th className="py-3 font-normal">Website</th><th className="w-16 px-2 py-3 text-right font-normal sm:w-20 sm:px-4">Score</th>{!compact && <th className="hidden w-24 px-4 py-3 text-right font-normal md:table-cell">LCP</th>}<th className="hidden w-11 sm:table-cell"><span className="sr-only">Details</span></th></tr>
    </thead>
    <tbody>{sites.map((site, index) => <tr key={site.id} className="group border-b border-border/70 transition-colors hover:bg-bg-card/60">
      <td className="py-5 pr-3 font-mono text-xs text-text-muted">{String(start + index).padStart(2, "0")}</td>
      <td className="py-5"><Link href={`/site/${site.slug}`} className="flex min-w-0 items-center gap-2 no-underline sm:gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-main text-text-muted"><GlobeHemisphereWestIcon size={20} aria-hidden /></span>
        <span className="min-w-0"><span className="block truncate font-medium text-text-primary group-hover:text-accent">{site.name}</span><span className="mt-0.5 block max-w-[42ch] truncate text-xs text-text-muted">{site.tagline || site.description}</span></span>
      </Link></td>
      <td className="px-2 py-5 text-right font-mono text-base tabular-nums sm:px-4"><span className={site.lastTestedAt && site.currentScore >= 90 ? "text-green" : "text-text-primary"}>{site.lastTestedAt ? site.currentScore : "—"}</span></td>
      {!compact && <td className="hidden px-4 py-5 text-right font-mono text-xs text-text-secondary md:table-cell">{site.currentLcp || "—"}</td>}
      <td className="hidden sm:table-cell"><Link href={`/site/${site.slug}`} aria-label={`View ${site.name}`} className="icon-button"><ArrowUpRightIcon size={18} aria-hidden /></Link></td>
    </tr>)}</tbody>
  </table></div>;
}

export function EmptyState({ title, description, href, action }: { title: string; description: string; href?: string; action?: string }) {
  return <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
    <h2 className="text-lg font-medium">{title}</h2><p className="mx-auto mt-2 max-w-[48ch] text-sm text-text-secondary">{description}</p>
    {href && action && <Link className="button-secondary mt-5" href={href}>{action}</Link>}
  </div>;
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages < 2) return null;
  return <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-3">
    {page > 1 ? <Link className="button-secondary" href={href(page - 1)}>Previous</Link> : <span />}
    <span className="text-sm text-text-muted">Page {page} of {pages}</span>
    {page < pages ? <Link className="button-secondary" href={href(page + 1)}>Next</Link> : <span />}
  </nav>;
}
