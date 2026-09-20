import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CaretRight, Gauge, Globe } from "@phosphor-icons/react/dist/ssr";
import { PageHeading, PageShell, SectionHeading } from "@/components/content/PageShell";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { categoryCatalog, categoryPath, findCategory } from "@/modules/catalog/categories";
import { categoryPageNumber, categoryPageSize, getCategoryListing, hasCategoryFilters, type CategorySearch } from "@/modules/catalog/public-categories";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata, siteUrl } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }>; searchParams: Promise<CategorySearch> };

async function collection({ params, searchParams }: Props) {
  const [{ category }, search] = await Promise.all([params, searchParams]);
  const entry = findCategory(category), page = categoryPageNumber(search);
  if (!entry || page === null) notFound();
  const listing = await getCategoryListing(entry.slug, page);
  if (listing.available && page > Math.max(1, listing.pages)) notFound();
  const path = categoryPath(entry.slug) + (page > 1 ? `?page=${page}` : "");
  return { entry, listing, page, path, filtered: hasCategoryFilters(search) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { entry, listing, page, path, filtered } = await collection(props);
  return pageMetadata({ title: `Fastest ${entry.name} websites: PageSpeed rankings${page > 1 ? `, page ${page}` : ""}`,
    description: `Compare ${entry.name} websites by recorded mobile PageSpeed performance. ${entry.description} Read loading metrics and individual test dates.`,
    path, index: listing.available && listing.total > 0 && !filtered });
}

export default async function CategoryPage(props: Props) {
  const { entry, listing, page, path, filtered } = await collection(props);
  const offset = (page - 1) * categoryPageSize;
  const jsonLd = {
    ...webPageSchema({ path, name: `${entry.name} website performance`, description: entry.description, type: "CollectionPage",
      trail: [{ name: "TheFastestWeb", path: "/" }, { name: "Categories", path: "/categories" }, { name: entry.name, path }] }),
    mainEntity: { "@type": "ItemList", itemListOrder: "https://schema.org/ItemListOrderDescending", numberOfItems: listing.total,
      itemListElement: listing.sites.map((site, index) => ({ "@type": "ListItem", position: offset + index + 1,
        url: siteUrl(`/site/${encodeURIComponent(site.slug)}`), name: site.name })) },
  };
  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-text-secondary mb-8">
        <Link href="/" className="hover:text-accent">TheFastestWeb</Link><CaretRight size={12} aria-hidden="true" />
        <Link href="/categories" className="hover:text-accent">Categories</Link><CaretRight size={12} aria-hidden="true" />
        <span aria-current="page" className="text-text-primary">{entry.name}</span>
      </nav>
      <PageHeading eyebrow="The category leaderboard" title={<>Fastest <span className="text-accent">{entry.name}</span> websites.</>} description={entry.description}>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <Link href={`/submit?category=${entry.slug}`} className="content-action-secondary">Submit to this category <ArrowRight size={18} aria-hidden="true" /></Link>
        {/* Native document navigation: this route returns text/markdown, not an App Router page. */}
        {page === 1 && !filtered && <a href={`/markdown${categoryPath(entry.slug)}`} className="content-link text-sm">Read as Markdown</a>}
        </div>
      </PageHeading>
      <div className="flex flex-wrap gap-x-7 gap-y-3 pb-6 mb-7 border-b border-border text-sm text-text-secondary">
        <span className="inline-flex items-center gap-2"><Globe size={18} aria-hidden="true" />{listing.available ? `${listing.total} public ${listing.total === 1 ? "website" : "websites"}` : "Website results are temporarily unavailable"}</span>
        <span className="inline-flex items-center gap-2"><Gauge size={18} aria-hidden="true" />Recorded mobile lab results</span>
      </div>
      {listing.sites.length > 0 ? (
        <>
          <div className="[&_.text-text-muted]:text-text-secondary [&>section]:mx-0">
            <LeaderboardTable key={`${entry.slug}:${page}`} initialSites={listing.sites} allowLoadMore={false} allowSort={false} rankingOffset={offset} />
          </div>
          {listing.pages > 1 && <nav aria-label="Category pagination" className="flex flex-wrap items-center justify-between gap-4 my-8 text-sm">
            <div>{page > 1 && <Link rel="prev" href={categoryPath(entry.slug) + (page > 2 ? `?page=${page - 1}` : "")} className="content-action-secondary"><ArrowLeft size={16} aria-hidden="true" /> Previous</Link>}</div>
            <span className="text-text-secondary">Page {page} of {listing.pages}</span>
            <div>{page < listing.pages && <Link rel="next" href={`${categoryPath(entry.slug)}?page=${page + 1}`} className="content-action-secondary">Next <ArrowRight size={16} aria-hidden="true" /></Link>}</div>
          </nav>}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-bg-card px-6 py-12 mb-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight mb-3">{listing.available ? "There is room for your website here." : "Please check back shortly."}</h2>
          <p className="text-text-secondary text-sm leading-7 max-w-lg">{listing.available ? "Be the first to publish a measured website in this collection. Choose this category when you submit your listing." : "We could not load the recorded results. Existing website listings have not been removed."}</p>
          {listing.available && <Link href={`/submit?category=${entry.slug}`} className="content-action mt-6">Submit your site <ArrowRight size={18} aria-hidden="true" /></Link>}
        </div>
      )}
      <section aria-labelledby="category-comparison" className="content-section mt-12">
        <h2 id="category-comparison" className="font-display text-[clamp(1.4rem,2.5vw,1.9rem)] font-semibold tracking-tight mb-4">Comparing {entry.name} website performance</h2>
        <div className="content-prose"><p>{entry.focus}</p><p>Rankings use recorded mobile lab scores. Open a website report to see loading metrics, performance history and the last test date. Results can change between runs and do not certify real-user Core Web Vitals. Paid plans do not increase a measured score.</p></div>
        <div className="flex flex-wrap gap-5 mt-5 text-sm"><Link href="/about#measurements" className="content-link">How measurements work</Link><Link href="/test" className="content-link">Test a website</Link></div>
      </section>
      <nav aria-label="Other website categories" className="content-section">
        <SectionHeading title="Explore another corner." description="Discover more websites and see how their performance compares." />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-4 mb-7">{categoryCatalog.filter((category) => category.slug !== entry.slug).map((category) => <Link key={category.slug} href={categoryPath(category.slug)} className="text-sm text-text-secondary hover:text-accent transition-colors">{category.name}</Link>)}</div>
        <Link href="/categories" className="content-link inline-flex items-center gap-2 text-sm">All categories <ArrowRight size={16} aria-hidden="true" /></Link>
      </nav>
    </PageShell>
  );
}
