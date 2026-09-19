import Link from "next/link";
import { ArrowsDownUpIcon, CodeIcon, GaugeIcon, GlobeHemisphereWestIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import type { getDiscovery } from "@/modules/sites/directory";
import { FacetMenu } from "./FacetMenu";
import { FilterForm } from "./FilterForm";

export type DirectorySort = "score" | "newest" | "lcp" | "name";
export type DirectoryParams = { q?: string; category?: string; technology?: string; country?: string; sort?: DirectorySort; minScore?: number };
type Facets = Awaited<ReturnType<typeof getDiscovery>>;

const scoreOptions: [number, string][] = [[100, "Perfect 100"], [90, "90 and above"], [50, "50 and above"]];
const sortOptions: [DirectorySort, string][] = [["score", "Highest score"], ["lcp", "Fastest LCP"], ["newest", "Recently added"], ["name", "Name, A to Z"]];

/** A directory URL for the given filters. Defaults and empty values never appear in it. */
export function directoryHref(basePath: string, params: DirectoryParams, change: Partial<DirectoryParams & { page: number }> = {}) {
  const next = { ...params, ...change };
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.category) search.set("category", next.category);
  if (next.technology) search.set("technology", next.technology);
  if (next.country) search.set("country", next.country);
  if (next.minScore !== undefined) search.set("minScore", String(next.minScore));
  if (next.sort && next.sort !== "score") search.set("sort", next.sort);
  if (next.page && next.page > 1) search.set("page", String(next.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function isFiltered(params: DirectoryParams) {
  return Boolean(params.q || params.category || params.technology || params.country || params.minScore !== undefined);
}

/**
 * The control strip across the top of a website list. Search and the facets share one line with the order and
 * the view at its right end; categories sit beneath as chips; whatever is applied is listed with its way out.
 */
export function DirectoryFilters({ basePath, params, facets, total, lockedCategory = false }: { basePath: string; params: DirectoryParams; facets: Facets | null; total?: number; lockedCategory?: boolean }) {
  const href = (change: Partial<DirectoryParams>) => directoryHref(basePath, params, change);
  const technology = facets?.technologies.find((item) => item.slug === params.technology);
  const country = facets?.countries.find((item) => item.code === params.country);
  const scoreLabel = params.minScore === undefined ? undefined : scoreOptions.find(([value]) => value === params.minScore)?.[1] ?? `${params.minScore} and above`;
  const sort = params.sort ?? "score";
  const active: [string, string, Partial<DirectoryParams>][] = [];
  if (params.q) active.push(["search", `“${params.q}”`, { q: undefined }]);
  if (params.category && !lockedCategory) active.push(["category", facets?.categories.find((item) => item.slug === params.category)?.name ?? params.category, { category: undefined }]);
  if (params.technology) active.push(["technology", technology?.name ?? params.technology, { technology: undefined }]);
  if (params.country) active.push(["country", country?.name ?? params.country, { country: undefined }]);
  if (scoreLabel) active.push(["score", "Score: " + scoreLabel, { minScore: undefined }]);
  return <div className="directory-toolbar flex flex-col gap-4 rounded-2xl border border-border bg-bg-main p-4 sm:p-5">
    <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
      <FilterForm key={directoryHref("", params)} action={basePath} className="relative flex min-w-0 flex-1 items-center transition-opacity aria-busy:opacity-60">
        <label htmlFor="directory-filter" className="sr-only">Filter websites by name or idea</label>
        <MagnifyingGlassIcon size={18} className="pointer-events-none absolute left-4 text-text-muted" aria-hidden />
        <input id="directory-filter" type="search" name="q" maxLength={100} defaultValue={params.q} placeholder="Find a website, tool, or idea" className="h-11 w-full min-w-0 rounded-xl border border-border bg-bg-deep pl-11 pr-24 text-[15px] text-text-primary outline-none! transition-[border-color,box-shadow] placeholder:text-text-muted hover:border-text-muted focus:border-text-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand-fill)_40%,transparent)]" />
        {params.category && <input type="hidden" name="category" value={params.category} />}
        {params.technology && <input type="hidden" name="technology" value={params.technology} />}
        {params.country && <input type="hidden" name="country" value={params.country} />}
        {params.minScore !== undefined && <input type="hidden" name="minScore" value={params.minScore} />}
        {params.sort && params.sort !== "score" && <input type="hidden" name="sort" value={params.sort} />}
        <button type="submit" className="absolute right-1.5 inline-flex h-8 items-center rounded-lg bg-bg-main px-3.5 text-[13px] font-semibold text-text-primary shadow-sm transition-colors hover:bg-bg-card-hover">Filter</button>
      </FilterForm>
      <div className="flex flex-wrap items-center gap-2">
        <FacetMenu label="Score" value={scoreLabel} icon={<GaugeIcon size={16} aria-hidden />} options={[{ label: "Any score", href: href({ minScore: undefined }), selected: params.minScore === undefined }, ...scoreOptions.map(([value, label]) => ({ label, href: href({ minScore: value }), selected: params.minScore === value }))]} />
        {facets && facets.technologies.length > 0 && <FacetMenu label="Technology" value={technology?.name} icon={<CodeIcon size={16} aria-hidden />} options={[{ label: "Any technology", href: href({ technology: undefined }), selected: !params.technology }, ...facets.technologies.map((item) => ({ label: item.name, count: item.count, href: href({ technology: item.slug }), selected: params.technology === item.slug }))]} />}
        {facets && facets.countries.length > 0 && <FacetMenu label="Country" value={country?.name} icon={<GlobeHemisphereWestIcon size={16} aria-hidden />} options={[{ label: "Any country", href: href({ country: undefined }), selected: !params.country }, ...facets.countries.map((item) => ({ label: item.name, count: item.count, href: href({ country: item.code }), selected: params.country === item.code }))]} />}
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <FacetMenu label="Sort" value={sortOptions.find(([value]) => value === sort)?.[1]} icon={<ArrowsDownUpIcon size={16} aria-hidden />} align="right" searchable={false} highlight={sort !== "score"} options={sortOptions.map(([value, label]) => ({ label, href: href({ sort: value }), selected: sort === value }))} />
      </div>
    </div>
    {!lockedCategory && facets && facets.categories.length > 0 && <nav aria-label="Filter websites by category" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
      <Link href={href({ category: undefined })} scroll={false} aria-current={params.category ? undefined : "true"} className="chip min-h-9 shrink-0 px-4">All{total !== undefined && !params.category && <span className="stat-value text-[11px]">{total}</span>}</Link>
      {facets.categories.map((item) => <Link key={item.slug} href={href({ category: item.slug })} scroll={false} data-category={item.slug} aria-current={params.category === item.slug ? "true" : undefined} className="chip min-h-9 shrink-0 px-3.5"><span aria-hidden className="accent-dot" />{item.name}<span className="stat-value text-[11px]">{item.count}</span></Link>)}
    </nav>}
    {active.length > 0 && <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-text-muted">Filtered by</span>
      {active.map(([key, label, change]) => <Link key={key} href={href(change)} scroll={false} aria-label={`Remove ${key} filter: ${label}`} className="chip min-h-8 gap-1.5 border-border-light bg-bg-card pr-2.5 text-text-primary">{label}<XIcon size={12} weight="bold" aria-hidden /></Link>)}
      <Link href={directoryHref(basePath, { category: lockedCategory ? params.category : undefined, sort: params.sort })} scroll={false} className="ml-1 inline-flex min-h-8 items-center text-[13px] font-semibold text-text-primary underline decoration-brand decoration-2 underline-offset-4">Clear all</Link>
    </div>}
  </div>;
}
