import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, ArrowsDownUpIcon, CaretDownIcon, CaretRightIcon, GaugeIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { listDirectory, getDiscovery, directorySchema, type DirectoryQuery } from "@/modules/sites/directory";
import { AutoSubmitSelect } from "./AutoSubmitSelect";
import { FacetMenu } from "./FacetMenu";
import { EmptyState, Pagination, WebsiteList } from "./WebsiteList";

/** A taxonomy page fixes one filter in its path. The strip then leaves that control out and links siblings by path. */
export type DirectoryLock = { kind: "category" | "technology" | "country"; label: string };

const labelClass = "mb-2 block text-[13px] font-medium text-text-secondary";
const sortOptions = [["score", "Highest score"], ["lcp", "Fastest LCP"], ["newest", "Recently added"], ["name", "Name, A to Z"]] as const;
const scoreOptions = [[100, "Perfect 100"], [90, "90 and above"], [50, "50 and above"]] as const;

function FilterSelect({ id, label, name, value, children }: { id: string; label: string; name: string; value: string; children: ReactNode }) {
  return <div className="min-w-0 sm:flex-1 lg:w-52 lg:flex-none">
    <label htmlFor={id} className={labelClass}>{label}</label>
    <div className="relative">
      <AutoSubmitSelect id={id} name={name} defaultValue={value} className="form-field min-h-12 cursor-pointer appearance-none truncate rounded-xl pl-4 pr-11 text-sm">{children}</AutoSubmitSelect>
      <CaretDownIcon size={14} weight="bold" aria-hidden className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-text-secondary" />
    </div>
  </div>;
}

export async function DirectoryView({ query = {}, title = "Discover a faster web.", description = "Independent tools, thoughtful products and websites built with performance in mind.", basePath = "/explore", lock, fixedMinScore = false }: { query?: DirectoryQuery; title?: string; description?: string; basePath?: string; lock?: DirectoryLock; /** The route itself sets the score floor (tier pages), so it is not offered as a removable filter. */ fixedMinScore?: boolean }) {
  const [result, discovery] = await Promise.allSettled([listDirectory(query), getDiscovery()]);
  const filters = discovery.status === "fulfilled" ? discovery.value : null;
  const params = result.status === "fulfilled" ? result.value.query : null;
  function pageHref(page: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) if (value && !["page", "limit"].includes(key)) search.set(key, String(value));
    search.set("page", String(page)); return `${basePath}?${search}`;
  }

  const fallback = directorySchema.safeParse(query);
  const current = params ?? (fallback.success ? fallback.data : null);
  const active = { q: current?.q ?? "", category: current?.category ?? "", technology: current?.technology ?? "", country: current?.country ?? "", sort: current?.sort ?? "score", minScore: current?.minScore };
  /** Links for chips and the sort switch. The locked filter lives in the path, so it never appears as a parameter. */
  function filterHref(changes: Partial<typeof active>, path = basePath) {
    const next = { ...active, ...changes }, search = new URLSearchParams();
    for (const key of ["q", "category", "technology", "country"] as const) if (next[key] && key !== lock?.kind) search.set(key, next[key]);
    if (next.sort !== "score") search.set("sort", next.sort);
    if (next.minScore !== undefined) search.set("minScore", String(next.minScore));
    const text = search.toString();
    return text ? `${path}?${text}` : path;
  }

  const technologyName = filters?.technologies.find((item) => item.slug === active.technology)?.name ?? active.technology;
  const countryName = filters?.countries.find((item) => item.code === active.country)?.name ?? active.country;
  const removable = [
    active.q ? { key: "q", label: `“${active.q}”`, href: filterHref({ q: "" }) } : null,
    active.technology && lock?.kind !== "technology" ? { key: "technology", label: technologyName, href: filterHref({ technology: "" }) } : null,
    active.country && lock?.kind !== "country" ? { key: "country", label: countryName, href: filterHref({ country: "" }) } : null,
    active.minScore !== undefined && !fixedMinScore ? { key: "minScore", label: `Score ${active.minScore} or higher`, href: filterHref({ minScore: undefined }) } : null,
  ].filter((item) => item !== null);
  const narrowed = removable.length > 0 || Boolean(active.category && lock?.kind !== "category");
  const showTechnology = lock?.kind !== "technology" && Boolean(filters?.technologies.length);
  const showCountry = lock?.kind !== "country" && Boolean(filters?.countries.length);
  const total = result.status === "fulfilled" ? result.value.total : null;
  const categoryPath = (slug: string) => lock?.kind === "category" ? (slug ? `/categories/${slug}` : "/explore") : basePath;

  return <div className="page-shell mx-auto max-w-[1240px]">
    {lock && <nav aria-label="Breadcrumb" className="mb-6"><ol className="flex items-center gap-2 text-sm text-text-secondary">
      <li><Link href="/explore" className="inline-flex min-h-8 items-center rounded-full no-underline transition-colors hover:text-text-primary">Explore</Link></li>
      <li aria-hidden><CaretRightIcon size={12} weight="bold" /></li>
      <li className="page-eyebrow" aria-current="page">{lock.label}</li>
    </ol></nav>}
    {!lock && <p className="page-eyebrow mb-4">Explore the directory</p>}
    <h1 className="page-title max-w-[20ch] [overflow-wrap:anywhere]">{title}</h1>
    <div className="mt-6 flex flex-col justify-between gap-x-12 gap-y-8 lg:flex-row lg:items-end">
      <p className="page-description">{description}</p>
      {total !== null && total > 0 && <p className="flex shrink-0 items-end gap-3.5">
        <span className="stat-value text-[clamp(2.75rem,5.4vw,4.5rem)] font-medium leading-[.85] text-text-primary">{total}</span>
        <span className="pb-0.5 text-sm leading-snug text-text-secondary">{total === 1 ? "website" : "websites"}<br />{narrowed ? "matching your filters" : lock ? "in this collection" : fixedMinScore ? "in this tier" : "in the directory"}</span>
      </p>}
    </div>

    <div className="directory-toolbar mt-10 rounded-2xl border border-border bg-bg-main p-4 sm:p-5">
    <form action={basePath} role="search" aria-label="Search and filter websites" className="flex flex-col gap-x-3 gap-y-5 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-0 sm:basis-full lg:flex-1 lg:basis-0">
        <label htmlFor="directory-search" className={labelClass}>Search</label>
        <div className="relative">
          <MagnifyingGlassIcon size={18} weight="bold" aria-hidden className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input id="directory-search" className="form-field min-h-12 rounded-xl bg-bg-deep pl-12 pr-24 text-sm" type="search" name="q" maxLength={100} defaultValue={active.q} placeholder="Website or idea" />
          <button className="button-ink absolute right-1 top-1 min-h-10 px-4" type="submit">Search</button>
        </div>
      </div>
      {showTechnology ? <FilterSelect id="directory-technology" label="Technology" name="technology" value={active.technology}><option value="">All technologies</option>{filters?.technologies.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</FilterSelect>
        : active.technology && lock?.kind !== "technology" && <input type="hidden" name="technology" value={active.technology} />}
      {showCountry ? <FilterSelect id="directory-country" label="Country" name="country" value={active.country}><option value="">All countries</option>{filters?.countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</FilterSelect>
        : active.country && lock?.kind !== "country" && <input type="hidden" name="country" value={active.country} />}
      {active.category && lock?.kind !== "category" && <input type="hidden" name="category" value={active.category} />}
      {active.sort !== "score" && <input type="hidden" name="sort" value={active.sort} />}
      {active.minScore !== undefined && <input type="hidden" name="minScore" value={active.minScore} />}
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:min-h-14">
        {!fixedMinScore && <FacetMenu label="Score" value={active.minScore === undefined ? undefined : scoreOptions.find(([value]) => value === active.minScore)?.[1] ?? `${active.minScore} and above`} icon={<GaugeIcon size={16} aria-hidden />} options={[{ label: "Any score", href: filterHref({ minScore: undefined }), selected: active.minScore === undefined }, ...scoreOptions.map(([value, label]) => ({ label, href: filterHref({ minScore: value }), selected: active.minScore === value }))]} />}
        <FacetMenu label="Sort" value={sortOptions.find(([value]) => value === active.sort)?.[1]} icon={<ArrowsDownUpIcon size={16} aria-hidden />} align="right" searchable={false} highlight={active.sort !== "score"} options={sortOptions.map(([value, label]) => ({ label, href: filterHref({ sort: value }), selected: active.sort === value }))} />
      </div>
    </form>

    {filters && filters.categories.length > 0 && <nav aria-label="Categories" className="mt-6">
      <ul className="flex flex-wrap gap-2">
        <li className="shrink-0"><Link href={filterHref({ category: "" }, categoryPath(""))} aria-current={!active.category ? "true" : undefined} className={"chip min-h-9 px-3.5" + (!active.category ? " chip-active" : "")}>All categories</Link></li>
        {filters.categories.map((item) => { const selected = active.category === item.slug; return <li key={item.slug} className="relative shrink-0">
          <Link href={filterHref({ category: item.slug }, categoryPath(item.slug))} aria-current={selected ? (lock?.kind === "category" ? "page" : "true") : undefined} data-category={item.slug} className={"chip min-h-9 whitespace-nowrap px-3.5" + (selected ? " chip-active" : "")}><span aria-hidden className="accent-dot" />{item.name}<span className={"stat-value text-xs" + (selected ? "" : " text-text-muted")}>{item.count}<span className="sr-only"> websites</span></span></Link>
        </li>; })}
      </ul>
    </nav>}
    </div>

    <section aria-label="Results" className="mt-10 sm:mt-12">
      {result.status === "fulfilled" ? <>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          {removable.length > 0 ? <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
            {removable.map((item) => <li key={item.key} className="min-w-0"><Link href={item.href} className="chip max-w-full pr-2.5" aria-label={`Remove filter ${item.label}`}><span className="max-w-[22ch] truncate">{item.label}</span><XIcon size={12} weight="bold" aria-hidden /></Link></li>)}
            <li><Link href={basePath} className="link-underline ml-2 text-[13px]">Clear all</Link></li>
          </ul> : result.value.sites.length === 0 ? <span /> : <p className="text-[13px] text-text-secondary">{active.sort === "newest" ? "Newest first, with each website’s latest recorded mobile lab score." : active.sort === "lcp" ? "Fastest Largest Contentful Paint first." : active.sort === "name" ? "In alphabetical order, with each website’s latest recorded mobile lab score." : "Ranked by latest recorded mobile lab score."}</p>}
          <Link href="/methodology" className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-medium text-text-secondary no-underline transition-colors hover:text-text-primary">How we measure <ArrowUpRightIcon size={14} aria-hidden /></Link>
        </div>
        {result.value.sites.length ? <WebsiteList sites={result.value.sites} start={(result.value.page - 1) * result.value.query.limit + 1} />
          : <div className="dot-grid mt-4 rounded-2xl border border-dashed border-border-light px-6 py-12 sm:px-12 sm:py-16">
            <h2 className="max-w-[24ch] text-[clamp(1.5rem,2.6vw,2.125rem)] font-semibold leading-[1.1] tracking-[-.035em] font-stretch-[116%] [overflow-wrap:anywhere]">{active.q ? `No websites match “${active.q}”.` : narrowed ? "No websites match these filters." : "No websites here yet."}</h2>
            <p className="mt-4 max-w-[52ch] leading-relaxed text-text-secondary">{narrowed ? "Check the spelling, remove a filter, or go back to the whole collection." : "This collection fills up as owners add their websites. Yours could be the first."}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">{narrowed ? <Link href={basePath} className="button-ink">Clear all filters</Link> : <Link href="/submit" className="button-ink">Submit website</Link>}{narrowed ? <Link href="/submit" className="link-underline text-sm">Submit website</Link> : lock ? <Link href="/explore" className="link-underline text-sm">Explore websites</Link> : <Link href="/test" className="link-underline text-sm">Test a site</Link>}</div>
          </div>}
        <Pagination page={result.value.page} pages={result.value.pages} href={pageHref} />
      </> : <EmptyState title="The directory is temporarily unavailable" description="We could not load website measurements. Please try again shortly." href={basePath} action="Try again" />}
    </section>
  </div>;
}
