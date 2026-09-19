import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { DirectorySite } from "@/modules/sites/directory";
import { scoreTone } from "@/components/ui/ScoreTicks";
import { FaviconImg } from "@/components/ui/FaviconImg";

export const categoryLabels: Record<string, string> = { saas: "SaaS", tool: "Tool", directory: "Directory", blog: "Blog", ecommerce: "E-commerce", portfolio: "Portfolio", other: "Other" };

/**
 * Each row is one link: position, real website identity, a short description, category, score and LCP.
 * Favicons load lazily and fall back to a monogram. Category color stays secondary to the actual score.
 * Columns are shared with the header through `.site-grid`, so they line up at every breakpoint.
 */
export function WebsiteList({ sites, start = 1, podium = false }: { sites: DirectorySite[]; start?: number; podium?: boolean }) {
  if (!sites.length) return <EmptyState title="No websites here yet" description="Try a different filter, or be the first to submit a website." />;
  return <div className="min-w-0">
    <div aria-hidden className="site-grid px-4 pb-2 text-xs font-medium text-text-muted sm:px-5">
      <span>#</span><span>Website</span><span className="hidden md:block">Category</span>
      <span className="text-right">Score</span><span className="hidden text-right sm:block">LCP</span><span className="hidden sm:block" />
    </div>
    <ol className="grid gap-2">{sites.map((site, index) => {
      const position = start + index;
      const measured = Boolean(site.lastTestedAt);
      return <li key={site.id} className="min-w-0"><Link href={`/site/${site.slug}`} data-category={site.category} className="site-row site-grid group px-4 py-3 no-underline sm:px-5">
        <span className={"stat-value text-xs " + (podium && position <= 3 ? "inline-flex h-6 w-7 items-center justify-center rounded-lg bg-brand font-semibold text-on-brand" : "text-text-muted")}><span className="sr-only">Position </span>{String(position).padStart(2, "0")}</span>
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-main p-2"><FaviconImg url={site.url} src={site.faviconUrl ?? undefined} className="h-7 w-7 rounded-md object-contain" /></span>
          <span className="min-w-0"><span className="flex min-w-0 items-baseline gap-3"><span className="truncate text-[15px] font-semibold tracking-[-.015em] text-text-primary">{site.name}</span><span className="hidden truncate text-xs text-text-muted lg:block">{hostname(site.url)}</span></span><span className="mt-1 block truncate text-[13px] text-text-secondary">{site.tagline || site.description}</span></span>
        </span>
        <span className="hidden min-w-0 md:block"><span className="accent-pill max-w-full"><span aria-hidden className="accent-dot" /><span className="truncate">{categoryLabels[site.category] ?? site.category}</span></span></span>
        <span className={"stat-value text-right text-[1.4rem] font-medium leading-none " + scoreTone(site.currentScore, measured)}><span className="sr-only">Score </span>{measured ? site.currentScore : <span className="text-xs">N/A</span>}</span>
        <span className="stat-value hidden text-right text-xs text-text-secondary sm:block"><span className="sr-only">LCP </span>{measured && site.currentLcp ? site.currentLcp.replace(/\s+/g, "") : "N/A"}</span>
        <ArrowUpRightIcon size={16} className="hidden justify-self-end text-text-muted transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary sm:block" aria-hidden />
      </Link></li>;
    })}</ol>
  </div>;
}

export function monogram(name: string) {
  return (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "·").toUpperCase();
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function EmptyState({ title, description, href, action }: { title: string; description: string; href?: string; action?: string }) {
  return <div className="dot-grid rounded-2xl border border-dashed border-border-light px-6 py-14 text-center">
    <h2 className="text-lg font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-[48ch] text-sm text-text-secondary">{description}</p>
    {href && action && <Link className="button-secondary mt-6" href={href}>{action}</Link>}
  </div>;
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages < 2) return null;
  return <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-3">
    {page > 1 ? <Link className="button-secondary" href={href(page - 1)}>Previous</Link> : <span />}
    <span className="stat-value text-sm text-text-muted">Page {page} of {pages}</span>
    {page < pages ? <Link className="button-secondary" href={href(page + 1)}>Next</Link> : <span />}
  </nav>;
}
