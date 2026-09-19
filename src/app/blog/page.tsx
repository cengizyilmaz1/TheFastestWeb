import type { Metadata } from "next";
import Link from "next/link";
import { getPaginatedPosts, getAllPosts } from "@/lib/blog";
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
  return <div className="page-shell mx-auto max-w-[1120px]">
    <div className="mb-8 border-b border-border pb-10"><p className="page-eyebrow mb-4">The performance journal · {all.length} articles</p><h1 className="page-title max-w-[15ch]">A faster web is a learned skill.</h1><p className="page-description mt-5">Understand the measurements, find the bottlenecks, and make your next improvement count.</p></div>
    <form action="/blog" className="mb-10 flex flex-wrap items-end gap-4" aria-label="Filter journal articles">
      <div className="min-w-44 flex-1"><label htmlFor="blog-category" className="mb-2 block text-sm">Category</label><select id="blog-category" name="category" defaultValue={category ?? ""} className="form-field"><option value="">All categories</option>{Object.entries(BLOG_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="min-w-44 flex-1"><label htmlFor="blog-tag" className="mb-2 block text-sm">Topic</label><select id="blog-tag" name="tag" defaultValue={tag ?? ""} className="form-field"><option value="">All topics</option>{tags.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
      <button type="submit" className="button-primary">Filter articles</button>{(category || tag) && <Link href="/blog" className="button-secondary">Clear filters</Link>}
    </form>
    {(category || tag) && <p className="mb-6 text-sm text-text-muted">{total} matching {total === 1 ? "article" : "articles"}</p>}
    {posts.length ? <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">{posts.map((post) => <article key={post.slug} className="border-t border-border pt-5">
      <div className="mb-5 flex items-center justify-between font-mono text-xs text-text-muted"><Link className="hover:text-accent" href={"/blog?category=" + post.category}>{BLOG_CATEGORIES[post.category]}</Link><span>{post.readingTime} min read</span></div>
      <h2 className="text-2xl font-medium leading-tight tracking-tight"><Link href={"/blog/" + post.slug} className="hover:text-accent">{post.title}</Link></h2><p className="mt-4 text-sm leading-relaxed text-text-secondary">{post.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">{post.tags.map((topic) => <Link key={topic} href={"/blog?tag=" + encodeURIComponent(topic)} className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-border-light">{topic}</Link>)}</div>
      <p className="mt-5 text-xs text-text-muted">{post.author} · <time dateTime={post.date}>{new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></p>
    </article>)}</div> : <EmptyState title={all.length ? "No matching articles" : "More to read soon"} description={all.length ? "Choose another category or topic to explore the journal." : "New performance guides will appear here."} />}
    <Pagination page={currentPage} pages={totalPages} href={pageHref} />
  </div>;
}
