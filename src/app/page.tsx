import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { siteConfig } from "@/config/site";
import { directorySchema, listDirectory, getDiscovery, listSponsoredPlacements } from "@/modules/sites/directory";
import { DirectoryFilters, directoryHref, isFiltered, type DirectoryParams } from "@/components/directory/DirectoryFilters";
import { SponsoredPlacements } from "@/components/directory/SponsoredPlacements";
import { WebsiteList, EmptyState } from "@/components/directory/WebsiteList";
import { getAllPosts } from "@/lib/blog";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const HOME_LIMIT = 12;

/** The home page is the directory: its filters live in the query string, and unknown or malformed values are ignored. */
function readFilters(raw: Record<string, string | string[] | undefined>): DirectoryParams {
  const flat = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = directorySchema.pick({ q: true, category: true, technology: true, country: true, sort: true, minScore: true }).safeParse({ q: flat.q, category: flat.category, technology: flat.technology, country: flat.country, sort: flat.sort, minScore: flat.minScore || undefined });
  if (!parsed.success) return {};
  const { q, category, technology, country, sort, minScore } = parsed.data;
  return { q: q || undefined, category: category || undefined, technology: technology || undefined, country: country || undefined, sort: sort === "score" ? undefined : sort, minScore };
}

// A filtered home page is the same page over a narrower list: it canonicalizes to the origin and stays out of the index.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const hasQuery = Object.keys(await searchParams).length > 0;
  return { title: "TheFastestWeb: A faster web starts here", description: "Discover the people and websites making the web faster. Explore real performance measurements, transparent rankings and weekly competitions.", alternates: { canonical: "/" }, ...(hasQuery ? { robots: { index: false, follow: true } } : {}) };
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const filters = readFilters(await searchParams);
  const filtering = isFiltered(filters);
  const [listing, discovery, sponsored, everything] = await Promise.allSettled([
    listDirectory({ ...filters, limit: HOME_LIMIT }), getDiscovery(), listSponsoredPlacements(1, 6), filtering ? listDirectory({ limit: 1 }) : Promise.resolve(null),
  ]);
  const posts = getAllPosts().slice(0, 3);
  const facets = discovery.status === "fulfilled" ? discovery.value : null;
  const result = listing.status === "fulfilled" ? listing.value : null;
  const directoryTotal = everything.status === "fulfilled" && everything.value ? everything.value.total : result?.total;
  return <div className="mx-auto max-w-[1240px]">
    <section id="directory" aria-labelledby="home-directory" className="scroll-mt-28 px-5 pb-20 pt-8 sm:px-8 sm:pb-24 sm:pt-14">
      <div className="home-intro mb-7 grid items-end gap-6 border-b border-border pb-7 sm:mb-10 sm:gap-8 sm:pb-10 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="page-eyebrow mb-4">The performance directory</p>
          <h1 id="home-directory" className="max-w-[20ch] text-[clamp(2.2rem,4.1vw,3.65rem)] font-semibold leading-[1.04] tracking-[-.05em] font-stretch-[115%]">{filtering ? "Find your kind of fast." : "The fast side of the web."}</h1>
          <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-text-secondary sm:text-base">Discover great products and the makers building a faster web.</p>
        </div>
        {directoryTotal !== undefined && facets && <dl className="flex gap-8 lg:gap-10 lg:pb-1">
          <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0"><dt className="order-2 text-xs text-text-secondary sm:mt-1">Websites</dt><dd className="stat-value text-2xl font-medium leading-tight text-text-primary sm:text-3xl">{directoryTotal}</dd></div>
          <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0"><dt className="order-2 text-xs text-text-secondary sm:mt-1">Categories</dt><dd className="stat-value text-2xl font-medium leading-tight text-text-primary sm:text-3xl">{facets.categories.length}</dd></div>
        </dl>}
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">{filtering ? "Your results" : "Explore the directory"}</h2><Link href="/methodology" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary">Mobile lab scores <ArrowUpRightIcon size={13} aria-hidden /></Link></div>
      <DirectoryFilters basePath="/" params={filters} facets={facets} total={directoryTotal} />
      <div className="mt-7">
        {!result ? <EmptyState title="The directory is taking a moment" description="Website measurements are temporarily unavailable. Please check back shortly." href="/explore" action="Open the directory" />
          : result.sites.length === 0 ? <EmptyState title="Nothing matches those filters" description="No listed website carries every one of them yet. Remove one and the directory widens." href="/" action="Clear filters" />
          : <>
            <p aria-live="polite" className="mb-4 text-[13px] text-text-secondary"><span className="stat-value text-text-primary">1-{result.sites.length}</span> of <span className="stat-value text-text-primary">{result.total}</span> {result.total === 1 ? "website" : "websites"}</p>
            <WebsiteList sites={result.sites} podium={!filters.sort} />
            {result.total > result.sites.length && <Link href={directoryHref("/explore", filters)} className="group mt-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-2 rounded-2xl border border-border bg-bg-main px-5 py-5 text-text-primary no-underline transition-colors hover:border-text-muted sm:px-6">
              <span className="text-sm text-text-secondary">More good websites are waiting.</span>
              <span className="inline-flex items-center gap-3 text-sm font-semibold">Browse all {result.total} websites <ArrowRightIcon size={18} weight="bold" className="transition-transform group-hover:translate-x-1" aria-hidden /></span>
            </Link>}
          </>}
      </div>
    </section>

    {sponsored.status === "fulfilled" && sponsored.value.items.length > 0 && <section className="px-5 pb-20 sm:px-8 sm:pb-24"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="page-eyebrow mb-2">Sponsored placements</p><h2 className="text-2xl font-semibold tracking-[-.035em]">Meet our supporters</h2></div><Link className="link-underline text-sm" href="/featured">View all</Link></div><SponsoredPlacements sites={sponsored.value.items} /></section>}

    <section className="px-5 pb-20 sm:px-8 sm:pb-28">
      <div className="grid gap-10 border-y border-border py-12 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div><p className="page-eyebrow mb-4">The weekly race</p><h2 className="section-title max-w-[15ch]">A little competition. A much faster web.</h2><p className="mt-5 max-w-[46ch] leading-relaxed text-text-secondary">Compare like with like. Mobile and desktop have separate rankings, measured with the same method. Completed competitions keep their results.</p><Link href="/leaderboard" className="button-ink mt-8">View the rankings <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link></div>
        <dl className="self-end text-[15px]">
          {[["Samples per device", "2"], ["Device strategies", "Mobile, desktop"], ["Calendar", "UTC, shared by everyone"], ["Finished races", "Results stay fixed"]].map(([term, value]) => <div key={term} className="flex items-baseline justify-between gap-6 border-t border-border py-4 first:border-t-0"><dt className="text-text-secondary">{term}</dt><dd className="text-right font-semibold text-text-primary">{value}</dd></div>)}
        </dl>
      </div>
    </section>

    {posts.length > 0 && <section className="px-5 pb-20 sm:px-8 sm:pb-28">
      <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[.8fr_1.2fr]">
        <div><p className="page-eyebrow mb-3">The performance journal</p><h2 className="section-title max-w-[14ch]">A faster web is a learned skill.</h2><Link className="link-underline mt-6 inline-block text-sm" href="/blog">Read the journal</Link></div>
        <div className="border-t border-border">{posts.map((post) => <article key={post.slug} className="group border-b border-border py-6"><Link href={"/blog/" + post.slug} className="grid gap-x-8 gap-y-2 no-underline sm:grid-cols-[1fr_auto] sm:items-baseline"><h3 className="text-xl font-semibold leading-snug tracking-[-.03em] text-text-primary group-hover:underline group-hover:decoration-brand group-hover:decoration-[3px] group-hover:underline-offset-4">{post.title}</h3><span className="stat-value text-xs text-text-muted sm:text-right">{post.readingTime} min read</span><p className="line-clamp-2 max-w-[62ch] text-sm leading-relaxed text-text-secondary sm:col-span-2">{post.description}</p></Link></article>)}</div>
      </div>
    </section>}

    <section className="px-5 pb-20 sm:px-8 sm:pb-24">
      <div className="surface-brand relative overflow-hidden rounded-[28px] px-7 py-12 sm:px-12 sm:py-16">
        <h2 className="max-w-[16ch] text-[clamp(2rem,5vw,4.25rem)] font-bold leading-[.98] tracking-[-.05em] font-stretch-[120%]">Made something fast? Give it a place here.</h2>
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3"><Link href="/submit" className="button-ink min-h-12 px-6 text-[15px]">Submit your website <ArrowUpRightIcon size={18} weight="bold" aria-hidden /></Link><Link href="/test" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-text-primary underline decoration-2 underline-offset-4">Test a site first</Link></div>
        <div aria-hidden className="tick-rule mt-12 opacity-70" />
      </div>
    </section>
    <span className="sr-only">{siteConfig.name}</span>
  </div>;
}
