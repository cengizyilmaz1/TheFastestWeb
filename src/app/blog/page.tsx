import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { getPaginatedPosts, getAllPosts, type PostMeta } from "@/lib/blog";
import { BLOG_CATEGORIES } from "@/lib/blog-content";
import { EmptyState, Pagination } from "@/components/directory/WebsiteList";
import { siteConfig } from "@/config/site";

type Query = { page?: string; category?: string; tag?: string };
export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  const query = await searchParams;
  return { title: "The performance journal", description: "Practical guides to website performance, lab metrics and a faster web.",
    alternates: { canonical: "/blog" }, robots: { index: !siteConfig.isDemo && !query.page && !query.category && !query.tag, follow: true },
    openGraph: { title: "The performance journal", images: [{ url: "/images/journal-cover.png", width: 1200, height: 630, alt: "TheFastestWeb performance journal" }] } };
}

const formatDate = (date: string, month: "long" | "short" = "long") => new Date(date).toLocaleDateString("en-US", { month, day: "numeric", year: "numeric", timeZone: "UTC" });
const titleLink = "no-underline decoration-brand underline-offset-4 hover:underline";

function ReadingTime({ minutes, className = "" }: { minutes: number; className?: string }) {
  return <span className={"whitespace-nowrap text-[13px] text-text-muted " + className}><span className="stat-value text-text-secondary">{minutes}</span> min read</span>;
}

function Topics({ post, className = "" }: { post: PostMeta; className?: string }) {
  if (!post.tags.length) return null;
  return <ul aria-label="Topics" className={"flex flex-wrap gap-2 " + className}>{post.tags.map((topic) => <li key={topic}><Link href={"/blog?tag=" + encodeURIComponent(topic)} className="chip min-h-7 px-2.5 text-xs">{topic}</Link></li>)}</ul>;
}

/** The newest article on the page carries the brand fill; it is the only yellow surface in the journal index. */
function LeadArticle({ post }: { post: PostMeta }) {
  return <article className="surface-brand relative flex min-h-[420px] flex-col justify-between gap-14 overflow-hidden rounded-[28px] p-7 sm:min-h-[480px] sm:p-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={"/blog?category=" + post.category} className="chip">{BLOG_CATEGORIES[post.category]}</Link>
      <span className="whitespace-nowrap text-[13px] text-text-secondary"><span className="stat-value text-base font-medium text-text-primary">{post.readingTime}</span> min read</span>
    </div>
    <div>
      <h3 className="max-w-[18ch] text-[clamp(1.9rem,3.7vw,3.25rem)] font-bold leading-[1.02] tracking-[-.045em] font-stretch-[116%]"><Link href={"/blog/" + post.slug} className="no-underline decoration-[3px] underline-offset-[6px] hover:underline">{post.title}</Link></h3>
      <p className="mt-5 max-w-[54ch] text-[1.0625rem] leading-relaxed text-text-secondary">{post.description}</p>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <p className="text-sm text-text-secondary">By {post.author}, <time dateTime={post.date}>{formatDate(post.date)}</time></p>
        <Link href={"/blog/" + post.slug} aria-label={"Read " + post.title} className="button-ink">Read article <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link>
      </div>
      <div aria-hidden className="tick-rule mt-9 opacity-70" />
    </div>
  </article>;
}

function SideArticle({ post }: { post: PostMeta }) {
  return <article className="flex flex-1 flex-col justify-center border-t border-border py-6 last:border-b">
    <div className="flex items-center justify-between gap-4 text-[13px] text-text-muted"><Link href={"/blog?category=" + post.category} className="font-medium text-text-secondary no-underline hover:text-text-primary">{BLOG_CATEGORIES[post.category]}</Link><ReadingTime minutes={post.readingTime} /></div>
    <h3 className="mt-3 text-xl font-semibold leading-snug tracking-[-.03em] sm:text-[1.375rem]"><Link href={"/blog/" + post.slug} className={titleLink + " decoration-[3px]"}>{post.title}</Link></h3>
    <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-text-secondary">{post.description}</p>
  </article>;
}

function ArticleRow({ post }: { post: PostMeta }) {
  return <li className="group grid gap-x-10 gap-y-3 border-b border-border py-7 transition-colors md:grid-cols-[9.5rem_minmax(0,1fr)] lg:grid-cols-[9.5rem_minmax(0,1fr)_15rem]">
    <div className="flex items-baseline gap-x-4 gap-y-1.5 text-[13px] text-text-muted md:flex-col md:pt-1.5">
      <time dateTime={post.date}>{formatDate(post.date, "short")}</time><ReadingTime minutes={post.readingTime} />
    </div>
    <div className="min-w-0">
      <h3 className="text-[1.375rem] font-semibold leading-[1.2] tracking-[-.035em] sm:text-[1.625rem]"><Link href={"/blog/" + post.slug} className={titleLink + " decoration-[3px]"}>{post.title}</Link></h3>
      <p className="mt-2.5 max-w-[62ch] text-[15px] leading-relaxed text-text-secondary">{post.description}</p>
      <p className="mt-3 text-[13px] text-text-muted"><Link href={"/blog?category=" + post.category} className="font-medium text-text-secondary no-underline hover:text-text-primary">{BLOG_CATEGORIES[post.category]}</Link>, by {post.author}</p>
    </div>
    <Topics post={post} className="content-start md:col-start-2 lg:col-start-3 lg:justify-end lg:pt-1.5" />
  </li>;
}

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams, raw = Number(query.page || 1);
  const category = typeof query.category === "string" ? query.category : undefined;
  const tag = typeof query.tag === "string" ? query.tag : undefined;
  const all = getAllPosts();
  const tags = [...new Set(all.flatMap((post) => post.tags))].sort();
  const { posts, currentPage, totalPages, total } = getPaginatedPosts(Number.isInteger(raw) && raw > 0 ? raw : 1, { category, tag });
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    if (category) params.set("category", category);
    if (tag) params.set("tag", tag);
    return "/blog?" + params;
  };
  const categoryHref = (value?: string) => {
    const params = new URLSearchParams();
    if (value) params.set("category", value);
    if (tag) params.set("tag", tag);
    const search = params.toString();
    return search ? "/blog?" + search : "/blog";
  };
  const filtered = Boolean(category || tag);
  // The first page opens with a lead article and a short side list; later pages are a plain index.
  const featured = currentPage === 1 && posts.length > 1;
  const [lead, ...others] = featured ? posts : [];
  const side = others.slice(0, 3), rows = featured ? others.slice(3) : posts;

  return <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20">
    <header>
      <p className="page-eyebrow mb-5">The performance journal</p>
      <h1 className="page-title max-w-[16ch]">A faster web is a learned skill.</h1>
      <div className="mt-8 flex flex-col justify-between gap-6 sm:mt-10 lg:flex-row lg:items-end">
        <p className="max-w-[44ch] text-lg leading-relaxed text-text-secondary sm:text-xl">Understand the measurements, find the bottlenecks, and make your next improvement count.</p>
        <p className="text-sm text-text-muted"><span className="stat-value text-2xl font-medium text-text-primary">{all.length}</span> articles</p>
      </div>
    </header>

    <div className="mt-10 flex flex-col gap-x-10 gap-y-6 border-y border-border py-5 sm:mt-14 lg:flex-row lg:items-end lg:justify-between">
      <nav aria-label="Journal categories">
        <ul className="flex flex-wrap gap-2">
          <li><Link href={categoryHref()} className="chip" aria-current={category ? undefined : "page"}>All</Link></li>
          {Object.entries(BLOG_CATEGORIES).map(([value, label]) => <li key={value}><Link href={categoryHref(value)} className="chip" aria-current={category === value ? "page" : undefined}>{label}</Link></li>)}
        </ul>
      </nav>
      <form action="/blog" className="flex flex-wrap items-end gap-3" aria-label="Filter journal articles">
        {category && <input type="hidden" name="category" value={category} />}
        <div className="min-w-44 flex-1 sm:flex-none"><label htmlFor="blog-tag" className="mb-1.5 block text-[13px] font-medium text-text-secondary">Topic</label><select id="blog-tag" name="tag" defaultValue={tag ?? ""} className="form-field min-h-11 rounded-full py-2 pl-4 sm:w-56"><option value="">All topics</option>{tags.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        <button type="submit" className="button-secondary text-sm! font-semibold!">Filter articles</button>
        {filtered && <Link href="/blog" className="link-underline mb-3 text-sm">Clear filters</Link>}
      </form>
    </div>

    {filtered && <p role="status" className="mt-6 text-sm text-text-secondary"><span className="stat-value font-medium text-text-primary">{total}</span> matching {total === 1 ? "article" : "articles"}{category && Object.hasOwn(BLOG_CATEGORIES, category) ? " in " + BLOG_CATEGORIES[category as keyof typeof BLOG_CATEGORIES] : ""}{tag ? " about " + tag : ""}</p>}

    {posts.length === 0 && <div className="mt-10"><EmptyState title={all.length ? "No matching articles" : "More to read soon"} description={all.length ? "Choose another category or topic to explore the journal." : "New performance guides will appear here."} href={all.length ? "/blog" : undefined} action={all.length ? "Show all articles" : undefined} /></div>}

    {lead && <section aria-labelledby="journal-latest" className="mt-10 sm:mt-14">
      <h2 id="journal-latest" className="sr-only">{filtered ? "Top matches" : "Latest articles"}</h2>
      <div className="grid gap-x-14 gap-y-4 lg:grid-cols-[1.3fr_1fr]">
        <LeadArticle post={lead} />
        {side.length > 0 && <div className="flex flex-col">{side.map((post) => <SideArticle key={post.slug} post={post} />)}</div>}
      </div>
    </section>}

    {rows.length > 0 && <section aria-labelledby="journal-index" className={featured ? "mt-20 sm:mt-28" : "mt-10 sm:mt-14"}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-light pb-6">
        <h2 id="journal-index" className="section-title">{featured ? "More from the journal" : filtered ? "Matching articles" : "Journal index"}</h2>
        {totalPages > 1 && <p className="stat-value text-sm text-text-muted">Page {currentPage} of {totalPages}</p>}
      </div>
      <ol>{rows.map((post) => <ArticleRow key={post.slug} post={post} />)}</ol>
    </section>}

    <Pagination page={currentPage} pages={totalPages} href={pageHref} />
  </div>;
}
