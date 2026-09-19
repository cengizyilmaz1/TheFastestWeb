import Link from "next/link";
import { listDirectory, getDiscovery, type DirectoryQuery } from "@/modules/sites/directory";
import { EmptyState, Pagination, WebsiteList } from "./WebsiteList";

export async function DirectoryView({ query = {}, title = "Discover a faster web.", description = "Independent tools, thoughtful products and websites built with performance in mind.", basePath = "/explore" }: { query?: DirectoryQuery; title?: string; description?: string; basePath?: string }) {
  const [result, discovery] = await Promise.allSettled([listDirectory(query), getDiscovery()]);
  const filters = discovery.status === "fulfilled" ? discovery.value : null;
  const params = result.status === "fulfilled" ? result.value.query : null;
  function pageHref(page: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) if (value && !["page", "limit"].includes(key)) search.set(key, String(value));
    search.set("page", String(page)); return `${basePath}?${search}`;
  }
  return <div className="page-shell mx-auto max-w-[1120px]">
    <p className="page-eyebrow mb-4">The directory</p><h1 className="page-title">{title}</h1><p className="page-description mt-4">{description}</p>
    <form action={basePath} className="my-8 grid gap-3 rounded-xl border border-border bg-bg-main p-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
      <label className="text-xs text-text-secondary">Search<input className="form-field mt-1" type="search" name="q" maxLength={100} defaultValue={params?.q} placeholder="Website or idea" /></label>
      <label className="text-xs text-text-secondary">Category<select className="form-field mt-1" name="category" defaultValue={params?.category || ""}><option value="">All categories</option>{filters?.categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="text-xs text-text-secondary">Country<select className="form-field mt-1" name="country" defaultValue={params?.country || ""}><option value="">All countries</option>{filters?.countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label className="text-xs text-text-secondary">Sort by<select className="form-field mt-1" name="sort" defaultValue={params?.sort || "score"}><option value="score">Latest mobile score</option><option value="newest">Recently added</option></select></label>
      {params?.technology && <input type="hidden" name="technology" value={params.technology} />}
      {params?.minScore !== undefined && <input type="hidden" name="minScore" value={params.minScore} />}
      <button className="button-primary self-end" type="submit">Apply filters</button>
    </form>
    {result.status === "fulfilled" ? <><div className="mb-3 flex flex-wrap justify-between gap-3 text-xs text-text-muted"><span>{result.value.total} websites{params?.technology && ` · ${params.technology}`}</span><span>Latest recorded mobile lab score · <Link href="/methodology" className="underline underline-offset-4">Measurement notes</Link></span></div><WebsiteList sites={result.value.sites} start={(result.value.page - 1) * result.value.query.limit + 1} /><Pagination page={result.value.page} pages={result.value.pages} href={pageHref} /></> : <EmptyState title="The directory is temporarily unavailable" description="We could not load website measurements. Please try again shortly." href={basePath} action="Try again" />}
  </div>;
}
